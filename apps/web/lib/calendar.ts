// apps/web/lib/calendar.ts
import axios from 'axios';
import { gGet } from './graph';

const GRAPH_BASE = process.env.GRAPH_BASE || 'https://graph.microsoft.com/v1.0';

interface TimeSlot {
  start: string;
  end: string;
  timezone: string;
}

interface BusinessHours {
  [key: string]: string; // e.g., "mon_fri": "09:00-17:00"
}

interface CalendarEvent {
  id: string;
  subject: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  attendees?: Array<{ emailAddress: { address: string; name?: string } }>;
  isAllDay?: boolean;
  showAs: 'free' | 'tentative' | 'busy' | 'oof' | 'workingElsewhere';
}

/**
 * Enhanced meeting time finder with business hours consideration
 */
export async function findOptimalMeetingTimes(
  accessToken: string,
  options: {
    attendeeEmail: string;
    attendeeName?: string;
    timezone: string;
    businessHours: BusinessHours;
    startDate?: Date;
    endDate?: Date;
    durationMinutes?: number;
    maxSuggestions?: number;
    preferredTimes?: 'morning' | 'afternoon' | 'any';
  }
): Promise<Array<{ 
  slot: TimeSlot; 
  confidence: number; 
  reason: string;
  formattedTime: string;
}>> {
  const {
    attendeeEmail,
    attendeeName,
    timezone,
    businessHours,
    startDate = new Date(),
    endDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 2 weeks
    durationMinutes = 30,
    maxSuggestions = 5,
    preferredTimes = 'any'
  } = options;

  try {
    // Get free/busy information for both parties
    const freeBusyData = await getFreeBusyInfo(accessToken, [attendeeEmail], startDate, endDate, timezone);
    const myFreeBusyData = await getFreeBusyInfo(accessToken, ['me'], startDate, endDate, timezone);

    // Generate time slots based on business hours
    const availableSlots = generateBusinessHourSlots(
      startDate,
      endDate,
      businessHours,
      timezone,
      durationMinutes
    );

    // Filter out busy times
    const freeSlots = availableSlots.filter(slot => {
      return isSlotFree(slot, freeBusyData[attendeeEmail]) &&
             isSlotFree(slot, myFreeBusyData['me']);
    });

    // Score and rank slots
    const scoredSlots = freeSlots.map(slot => ({
      slot,
      ...scoreTimeSlot(slot, preferredTimes, timezone),
      formattedTime: formatTimeSlot(slot, timezone)
    }));

    // Sort by confidence score and return top suggestions
    return scoredSlots
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, maxSuggestions);

  } catch (error) {
    console.error('Error finding meeting times:', error);
    
    // Fallback: return some reasonable default slots
    return generateFallbackSlots(startDate, timezone, durationMinutes, maxSuggestions);
  }
}

/**
 * Get free/busy information for specified attendees
 */
async function getFreeBusyInfo(
  accessToken: string,
  attendees: string[],
  startTime: Date,
  endTime: Date,
  timezone: string
): Promise<Record<string, Array<{ start: string; end: string }>>> {
  try {
    const response = await axios.post(
      `${GRAPH_BASE}/me/calendar/getSchedule`,
      {
        schedules: attendees,
        startTime: {
          dateTime: startTime.toISOString(),
          timeZone: timezone
        },
        endTime: {
          dateTime: endTime.toISOString(),
          timeZone: timezone
        },
        availabilityViewInterval: 15 // 15-minute intervals
      },
      {
        headers: { 
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const result: Record<string, Array<{ start: string; end: string }>> = {};
    
    response.data.value?.forEach((schedule: any, index: number) => {
      const attendee = attendees[index];
      result[attendee] = schedule.busyTimes || [];
    });

    return result;
  } catch (error) {
    console.warn('Could not get free/busy info:', error);
    return {};
  }
}

/**
 * Generate available time slots based on business hours
 */
function generateBusinessHourSlots(
  startDate: Date,
  endDate: Date,
  businessHours: BusinessHours,
  timezone: string,
  durationMinutes: number
): TimeSlot[] {
  const slots: TimeSlot[] = [];
  const currentDate = new Date(startDate);

  while (currentDate < endDate) {
    const dayOfWeek = currentDate.getDay(); // 0 = Sunday
    const dayKey = getDayKey(dayOfWeek);
    const hours = businessHours[dayKey];

    if (hours) {
      const daySlots = generateDaySlots(currentDate, hours, timezone, durationMinutes);
      slots.push(...daySlots);
    }

    currentDate.setDate(currentDate.getDate() + 1);
  }

  return slots;
}

/**
 * Generate time slots for a specific day
 */
function generateDaySlots(
  date: Date,
  businessHours: string,
  timezone: string,
  durationMinutes: number
): TimeSlot[] {
  const slots: TimeSlot[] = [];
  
  // Parse business hours (e.g., "09:00-17:00")
  const [startTime, endTime] = businessHours.split('-');
  const [startHour, startMin] = startTime.split(':').map(Number);
  const [endHour, endMin] = endTime.split(':').map(Number);

  const startDateTime = new Date(date);
  startDateTime.setHours(startHour, startMin, 0, 0);
  
  const endDateTime = new Date(date);
  endDateTime.setHours(endHour, endMin, 0, 0);

  const current = new Date(startDateTime);
  
  while (current.getTime() + (durationMinutes * 60 * 1000) <= endDateTime.getTime()) {
    const slotEnd = new Date(current.getTime() + (durationMinutes * 60 * 1000));
    
    slots.push({
      start: current.toISOString(),
      end: slotEnd.toISOString(),
      timezone
    });
    
    // Move to next 30-minute slot
    current.setMinutes(current.getMinutes() + 30);
  }

  return slots;
}

/**
 * Check if a time slot is free (no conflicts)
 */
function isSlotFree(
  slot: TimeSlot,
  busyTimes: Array<{ start: string; end: string }> = []
): boolean {
  const slotStart = new Date(slot.start);
  const slotEnd = new Date(slot.end);

  return !busyTimes.some(busy => {
    const busyStart = new Date(busy.start);
    const busyEnd = new Date(busy.end);
    
    // Check for any overlap
    return slotStart < busyEnd && slotEnd > busyStart;
  });
}

/**
 * Score a time slot based on preferences
 */
function scoreTimeSlot(
  slot: TimeSlot,
  preferredTimes: 'morning' | 'afternoon' | 'any',
  timezone: string
): { confidence: number; reason: string } {
  const startTime = new Date(slot.start);
  const hour = startTime.getHours();
  const dayOfWeek = startTime.getDay();
  
  let confidence = 0.5; // Base score
  let reasons: string[] = [];

  // Day of week preferences (weekdays are better)
  if (dayOfWeek >= 1 && dayOfWeek <= 5) {
    confidence += 0.2;
    reasons.push('weekday');
  } else {
    confidence -= 0.1;
    reasons.push('weekend');
  }

  // Time of day preferences
  if (preferredTimes === 'morning' && hour >= 9 && hour < 12) {
    confidence += 0.2;
    reasons.push('preferred morning time');
  } else if (preferredTimes === 'afternoon' && hour >= 13 && hour < 16) {
    confidence += 0.2;
    reasons.push('preferred afternoon time');
  } else if (preferredTimes === 'any') {
    if (hour >= 9 && hour < 17) {
      confidence += 0.1;
      reasons.push('business hours');
    }
  }

  // Avoid lunch time
  if (hour === 12) {
    confidence -= 0.15;
    reasons.push('lunch time');
  }

  // Prefer times that are not too early or too late
  if (hour < 8 || hour > 17) {
    confidence -= 0.2;
    reasons.push('outside typical hours');
  }

  // Proximity bonus (sooner is slightly better, but not too soon)
  const hoursFromNow = (startTime.getTime() - Date.now()) / (1000 * 60 * 60);
  if (hoursFromNow >= 24 && hoursFromNow <= 72) {
    confidence += 0.1;
    reasons.push('good timing');
  }

  return {
    confidence: Math.max(0, Math.min(1, confidence)),
    reason: reasons.join(', ')
  };
}

/**
 * Format time slot for display
 */
function formatTimeSlot(slot: TimeSlot, timezone: string): string {
  const start = new Date(slot.start);
  const end = new Date(slot.end);
  
  const formatter = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
    timeZone: timezone
  });

  const startFormatted = formatter.format(start);
  const endTime = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: timezone
  }).format(end);

  return `${startFormatted} - ${endTime}`;
}

/**
 * Generate fallback slots when API fails
 */
function generateFallbackSlots(
  startDate: Date,
  timezone: string,
  durationMinutes: number,
  maxSuggestions: number
): Array<{ 
  slot: TimeSlot; 
  confidence: number; 
  reason: string;
  formattedTime: string;
}> {
  const slots = [];
  const tomorrow = new Date(startDate);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(10, 0, 0, 0); // 10 AM tomorrow

  for (let i = 0; i < maxSuggestions; i++) {
    const start = new Date(tomorrow);
    start.setDate(start.getDate() + i);
    
    // Skip weekends
    if (start.getDay() === 0 || start.getDay() === 6) {
      start.setDate(start.getDate() + (start.getDay() === 0 ? 1 : 2));
    }
    
    const end = new Date(start);
    end.setMinutes(end.getMinutes() + durationMinutes);
    
    const slot = {
      start: start.toISOString(),
      end: end.toISOString(),
      timezone
    };

    slots.push({
      slot,
      confidence: 0.6,
      reason: 'fallback suggestion',
      formattedTime: formatTimeSlot(slot, timezone)
    });
  }

  return slots;
}

/**
 * Convert day of week number to business hours key
 */
function getDayKey(dayOfWeek: number): string {
  if (dayOfWeek >= 1 && dayOfWeek <= 5) return 'mon_fri';
  if (dayOfWeek === 6) return 'saturday';
  if (dayOfWeek === 0) return 'sunday';
  return 'mon_fri';
}

/**
 * Create a calendar event
 */
export async function createCalendarEvent(
  accessToken: string,
  eventDetails: {
    subject: string;
    startTime: string;
    endTime: string;
    timezone: string;
    attendees: string[];
    body?: string;
    location?: string;
  }
): Promise<{ id: string; webLink: string }> {
  const response = await axios.post(
    `${GRAPH_BASE}/me/events`,
    {
      subject: eventDetails.subject,
      body: {
        contentType: 'HTML',
        content: eventDetails.body || ''
      },
      start: {
        dateTime: eventDetails.startTime,
        timeZone: eventDetails.timezone
      },
      end: {
        dateTime: eventDetails.endTime,
        timeZone: eventDetails.timezone
      },
      location: eventDetails.location ? {
        displayName: eventDetails.location
      } : undefined,
      attendees: eventDetails.attendees.map(email => ({
        emailAddress: { address: email },
        type: 'required'
      }))
    },
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    }
  );

  return {
    id: response.data.id,
    webLink: response.data.webLink
  };
}