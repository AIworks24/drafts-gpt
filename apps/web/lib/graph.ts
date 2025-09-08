// apps/web/lib/graph.ts
import axios from "axios";

const GRAPH = process.env.GRAPH_BASE || "https://graph.microsoft.com/v1.0";

function bearer(token: string) {
  return { Authorization: `Bearer ${token}` };
}

/** Generic GET to Microsoft Graph (relative URL like '/me/messages/{id}') */
export async function gGet(
  accessToken: string,
  path: string,
  params?: Record<string, any>
) {
  const url = path.startsWith("http")
    ? path
    : `${GRAPH}${path.startsWith("/") ? path : `/${path}`}`;
  const { data } = await axios.get(url, {
    headers: bearer(accessToken),
    params,
  });
  return data;
}

/** Fetch a single message by id */
export async function getMessage(accessToken: string, id: string) {
  const { data } = await axios.get(`${GRAPH}/me/messages/${id}`, {
    headers: bearer(accessToken),
  });
  return data;
}

/** Create a reply (or reply-all) DRAFT for a message id; returns the draft message */
export async function createReplyDraft(
  accessToken: string,
  messageId: string,
  replyAll = false
) {
  const endpoint = `${GRAPH}/me/messages/${messageId}/${
    replyAll ? "createReplyAll" : "createReply"
  }`;
  const { data } = await axios.post(endpoint, {}, { headers: bearer(accessToken) });
  return data; // draft message object (isDraft=true)
}

/** Update the draft body HTML for a given draftId */
export async function updateDraftBody(
  accessToken: string,
  draftId: string,
  html: string
) {
  await axios.patch(
    `${GRAPH}/me/messages/${draftId}`,
    { body: { contentType: "html", content: html } },
    { headers: bearer(accessToken) }
  );
}

/** Find candidate meeting times and return readable slot strings */
export async function findMeetingTimes(
  accessToken: string,
  opts: {
    attendee: string;         // email
    tz: string;
    windowStartISO: string;   // e.g. now
    windowEndISO: string;     // e.g. +7 days
    durationISO?: string;     // default 30m
    maxCandidates?: number;   // default 5
  }
): Promise<string[]> {
  const { data } = await axios.post(
    `${GRAPH}/me/findMeetingTimes`,
    {
      attendees: [{ type: "required", emailAddress: { address: opts.attendee } }],
      timeConstraint: {
        activityDomain: "work",
        timeSlots: [
          {
            start: { dateTime: opts.windowStartISO, timeZone: opts.tz },
            end: { dateTime: opts.windowEndISO, timeZone: opts.tz },
          },
        ],
      },
      meetingDuration: opts.durationISO ?? "PT30M",
      maxCandidates: opts.maxCandidates ?? 5,
    },
    { headers: bearer(accessToken) }
  );

  const slots: string[] =
    data?.meetingTimeSuggestions?.map((s: any) => {
      const dt = s?.meetingTimeSlot?.start?.dateTime;
      return dt ? `${dt} ${opts.tz}` : "";
    }) ?? [];

  return slots.filter(Boolean);
}
