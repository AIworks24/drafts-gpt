import { useState, useEffect } from "react";
import type { GetServerSideProps } from "next";
import { getSession } from "@/lib/session";

type Props = { signedIn: boolean };

export const getServerSideProps: GetServerSideProps<Props> = async ({ req }) => {
  const cookieHeader = Array.isArray(req.headers.cookie) ? req.headers.cookie.join('; ') : (req.headers.cookie || '');
  const sess = getSession({ headers: { cookie: cookieHeader } });
  return { props: { signedIn: !!sess?.upn } };
};

export default function Dashboard({ signedIn }: Props) {
  const [client, setClient] = useState<any>(null);
  const [templates, setTemplates] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'settings' | 'templates' | 'test'>('settings');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // New template form
  const [newTemplate, setNewTemplate] = useState({
    title: '',
    category: 'general',
    body_md: ''
  });

  // Test form
  const [testForm, setTestForm] = useState({
    messageId: '',
    suggestTimes: true,
    replyAll: false,
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone
  });
  const [testResult, setTestResult] = useState<any>(null);
  const [testLoading, setTestLoading] = useState(false);

  useEffect(() => {
    if (signedIn) {
      loadData();
    } else {
      setLoading(false);
    }
  }, [signedIn]);

  const loadData = async () => {
    try {
      // Load or create client
      const clientRes = await fetch('/api/clients');
      if (clientRes.ok) {
        const clientData = await clientRes.json();
        setClient(clientData);
        
        if (clientData?.id) {
          // Load templates for this client
          const templatesRes = await fetch(`/api/templates?client_id=${clientData.id}`);
          if (templatesRes.ok) {
            const templatesData = await templatesRes.json();
            setTemplates(templatesData);
          }
        }
      }
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveClient = async () => {
    if (!client) return;
    setSaving(true);
    try {
      const res = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(client)
      });
      if (res.ok) {
        const updated = await res.json();
        setClient(updated);
        alert('Client settings saved successfully!');
      }
    } catch (error) {
      console.error('Failed to save client:', error);
      alert('Failed to save client settings');
    } finally {
      setSaving(false);
    }
  };

  const saveTemplate = async () => {
    if (!client?.id || !newTemplate.title || !newTemplate.body_md) return;
    setSaving(true);
    try {
      const res = await fetch('/api/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newTemplate,
          client_id: client.id
        })
      });
      if (res.ok) {
        setNewTemplate({ title: '', category: 'general', body_md: '' });
        loadData(); // Reload to show new template
        alert('Template saved successfully!');
      }
    } catch (error) {
      console.error('Failed to save template:', error);
      alert('Failed to save template');
    } finally {
      setSaving(false);
    }
  };

  const testDraft = async () => {
    if (!signedIn || !testForm.messageId) return;
    setTestLoading(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/graph/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: 'self',
          messageId: testForm.messageId,
          suggestTimes: testForm.suggestTimes,
          replyAll: testForm.replyAll,
          tz: testForm.tz
        })
      });
      const result = await res.json();
      setTestResult(result);
    } catch (error) {
      setTestResult({ error: error.message });
    } finally {
      setTestLoading(false);
    }
  };

  const subscribe = async () => {
    try {
      const res = await fetch('/api/graph/subscribe', { method: 'POST' });
      const result = await res.json();
      if (res.ok) {
        alert('Successfully subscribed to mailbox webhook!');
      } else {
        alert(`Subscription failed: ${result.error}`);
      }
    } catch (error) {
      alert(`Subscription failed: ${error.message}`);
    }
  };

  if (loading) {
    return (
      <main style={{ padding: 24, fontFamily: "system-ui", textAlign: 'center' }}>
        <h1>Loading...</h1>
      </main>
    );
  }

  return (
    <main style={{ padding: 24, fontFamily: "system-ui", maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ margin: "0 0 8px 0", fontSize: 32, fontWeight: 700 }}>
          Drafts-GPT Dashboard
        </h1>
        <p style={{ margin: 0, color: "#666", fontSize: 16 }}>
          Configure your AI email responses, templates, and settings
        </p>
      </div>

      {/* Auth Status */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: signedIn ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' : 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
        color: 'white',
        padding: 20,
        borderRadius: 12,
        marginBottom: 24
      }}>
        <div>
          <strong>Microsoft 365 Connection</strong>
          <div style={{ fontSize: 14, marginTop: 4, opacity: 0.9 }}>
            {signedIn ? 'Connected and ready for email processing' : 'Not connected - sign in to enable features'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          {signedIn ? (
            <>
              <button onClick={subscribe} style={{
                background: 'rgba(255,255,255,0.2)',
                color: 'white',
                border: '1px solid rgba(255,255,255,0.3)',
                padding: '10px 16px',
                borderRadius: 8,
                cursor: 'pointer'
              }}>
                Subscribe to Webhook
              </button>
              <a href="/api/auth/logout" style={{
                background: 'rgba(255,255,255,0.2)',
                color: 'white',
                border: '1px solid rgba(255,255,255,0.3)',
                padding: '10px 16px',
                borderRadius: 8,
                textDecoration: 'none'
              }}>
                Sign Out
              </a>
            </>
          ) : (
            <a href="/api/auth/login" style={{
              background: 'white',
              color: '#374151',
              padding: '10px 16px',
              borderRadius: 8,
              textDecoration: 'none',
              fontWeight: 600
            }}>
              Sign In with Microsoft
            </a>
          )}
        </div>
      </div>

      {signedIn && client && (
        <>
          {/* Navigation Tabs */}
          <div style={{
            display: 'flex',
            borderBottom: '2px solid #e5e7eb',
            marginBottom: 24
          }}>
            {[
              { key: 'settings', label: 'Client Settings' },
              { key: 'templates', label: `Templates (${templates.length})` },
              { key: 'test', label: 'Test Draft' }
            ].map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key as any)}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: '12px 24px',
                  fontSize: 16,
                  cursor: 'pointer',
                  borderBottom: '2px solid transparent',
                  color: activeTab === tab.key ? '#3b82f6' : '#6b7280',
                  borderBottomColor: activeTab === tab.key ? '#3b82f6' : 'transparent',
                  fontWeight: activeTab === tab.key ? 600 : 400
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          {activeTab === 'settings' && (
            <div style={{
              background: 'white',
              border: '1px solid #e5e7eb',
              borderRadius: 12,
              padding: 24,
              boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)'
            }}>
              <h3 style={{ marginTop: 0 }}>Client Settings</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                <label>
                  <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 14 }}>Client Name</div>
                  <input
                    value={client.name || ''}
                    onChange={(e) => setClient({...client, name: e.target.value})}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      border: '1px solid #d1d5db',
                      borderRadius: 8,
                      fontSize: 14
                    }}
                    placeholder="e.g., Acme Corporation"
                  />
                </label>
                
                <label>
                  <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 14 }}>Timezone</div>
                  <input
                    value={client.timezone || 'America/New_York'}
                    onChange={(e) => setClient({...client, timezone: e.target.value})}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      border: '1px solid #d1d5db',
                      borderRadius: 8,
                      fontSize: 14
                    }}
                    placeholder="America/New_York"
                  />
                </label>
              </div>

              <label style={{ display: 'block', marginBottom: 16 }}>
                <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 14 }}>Response Tone</div>
                <select
                  value={client.tone?.voice || 'professional'}
                  onChange={(e) => setClient({
                    ...client, 
                    tone: {...(client.tone || {}), voice: e.target.value}
                  })}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    border: '1px solid #d1d5db',
                    borderRadius: 8,
                    fontSize: 14
                  }}
                >
                  <option value="professional">Professional</option>
                  <option value="friendly">Friendly</option>
                  <option value="casual">Casual</option>
                  <option value="formal">Formal</option>
                </select>
              </label>

              <label style={{ display: 'block', marginBottom: 16 }}>
                <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 14 }}>Company Policies & Instructions</div>
                <textarea
                  value={client.policies || ''}
                  onChange={(e) => setClient({...client, policies: e.target.value})}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    border: '1px solid #d1d5db',
                    borderRadius: 8,
                    fontSize: 14,
                    minHeight: 80,
                    resize: 'vertical'
                  }}
                  rows={4}
                  placeholder="Enter policies and guidelines for AI responses..."
                />
              </label>

              <label style={{ display: 'block', marginBottom: 16 }}>
                <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 14 }}>Email Signature</div>
                <textarea
                  value={client.signature || ''}
                  onChange={(e) => setClient({...client, signature: e.target.value})}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    border: '1px solid #d1d5db',
                    borderRadius: 8,
                    fontSize: 14,
                    minHeight: 60,
                    resize: 'vertical'
                  }}
                  rows={3}
                  placeholder="<p>Best regards,<br/>Your Name<br/>Company Name</p>"
                />
              </label>

              <button 
                onClick={saveClient} 
                disabled={saving}
                style={{
                  background: '#3b82f6',
                  color: 'white',
                  border: 'none',
                  padding: '12px 20px',
                  borderRadius: 8,
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                {saving ? 'Saving...' : 'Save Settings'}
              </button>
            </div>
          )}

          {activeTab === 'templates' && (
            <div style={{
              background: 'white',
              border: '1px solid #e5e7eb',
              borderRadius: 12,
              padding: 24,
              boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)'
            }}>
              <h3 style={{ marginTop: 0 }}>Email Templates</h3>
              
              {/* Existing Templates */}
              {templates.length > 0 && (
                <div style={{ marginBottom: 24 }}>
                  <h4>Existing Templates</h4>
                  <div style={{ display: 'grid', gap: 12 }}>
                    {templates.map(template => (
                      <div key={template.id} style={{
                        padding: 16,
                        background: '#f8f9fa',
                        borderRadius: 8,
                        border: '1px solid #e9ecef'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                          <strong>{template.title}</strong>
                          <span style={{ 
                            fontSize: 12, 
                            color: '#666',
                            background: '#e5e7eb',
                            padding: '2px 8px',
                            borderRadius: 4
                          }}>
                            {template.category}
                          </span>
                        </div>
                        <div style={{ fontSize: 14, color: '#666' }}>
                          {template.body_md.slice(0, 100)}...
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* New Template Form */}
              <div style={{ borderTop: templates.length > 0 ? '1px solid #eee' : 'none', paddingTop: templates.length > 0 ? 24 : 0 }}>
                <h4>Create New Template</h4>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, marginBottom: 16 }}>
                  <label>
                    <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 14 }}>Title</div>
                    <input
                      value={newTemplate.title}
                      onChange={(e) => setNewTemplate({...newTemplate, title: e.target.value})}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        border: '1px solid #d1d5db',
                        borderRadius: 8,
                        fontSize: 14
                      }}
                      placeholder="e.g., Meeting Request Response"
                    />
                  </label>
                  
                  <label>
                    <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 14 }}>Category</div>
                    <select
                      value={newTemplate.category}
                      onChange={(e) => setNewTemplate({...newTemplate, category: e.target.value})}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        border: '1px solid #d1d5db',
                        borderRadius: 8,
                        fontSize: 14
                      }}
                    >
                      <option value="general">General</option>
                      <option value="meeting">Meeting</option>
                      <option value="inquiry">Inquiry</option>
                      <option value="follow-up">Follow-up</option>
                    </select>
                  </label>
                </div>

                <label style={{ display: 'block', marginBottom: 16 }}>
                  <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 14 }}>Template Body (HTML/Markdown)</div>
                  <textarea
                    value={newTemplate.body_md}
                    onChange={(e) => setNewTemplate({...newTemplate, body_md: e.target.value})}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      border: '1px solid #d1d5db',
                      borderRadius: 8,
                      fontSize: 14,
                      minHeight: 120,
                      resize: 'vertical'
                    }}
                    rows={6}
                    placeholder="<p>Thank you for your email. I'll review your message and get back to you soon.</p>"
                  />
                </label>

                <button 
                  onClick={saveTemplate} 
                  disabled={saving || !newTemplate.title || !newTemplate.body_md}
                  style={{
                    background: '#3b82f6',
                    color: 'white',
                    border: 'none',
                    padding: '12px 20px',
                    borderRadius: 8,
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  {saving ? 'Saving...' : 'Save Template'}
                </button>
              </div>
            </div>
          )}

          {activeTab === 'test' && (
            <div style={{
              background: 'white',
              border: '1px solid #e5e7eb',
              borderRadius: 12,
              padding: 24,
              boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)'
            }}>
              <h3 style={{ marginTop: 0 }}>Test Draft Creation</h3>
              <p style={{ color: '#666', marginBottom: 20 }}>
                Test your AI email responses by providing an Outlook message ID
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, marginBottom: 16 }}>
                <label>
                  <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 14 }}>Message ID</div>
                  <input
                    value={testForm.messageId}
                    onChange={(e) => setTestForm({...testForm, messageId: e.target.value})}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      border: '1px solid #d1d5db',
                      borderRadius: 8,
                      fontSize: 14
                    }}
                    placeholder="Enter Outlook message ID"
                  />
                </label>
                
                <label>
                  <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 14 }}>Timezone</div>
                  <input
                    value={testForm.tz}
                    onChange={(e) => setTestForm({...testForm, tz: e.target.value})}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      border: '1px solid #d1d5db',
                      borderRadius: 8,
                      fontSize: 14
                    }}
                  />
                </label>
              </div>

              <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="checkbox"
                    checked={testForm.suggestTimes}
                    onChange={(e) => setTestForm({...testForm, suggestTimes: e.target.checked})}
                  />
                  Suggest meeting times
                </label>
                
                <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="checkbox"
                    checked={testForm.replyAll}
                    onChange={(e) => setTestForm({...testForm, replyAll: e.target.checked})}
                  />
                  Reply all
                </label>
              </div>

              <button
                onClick={testDraft}
                disabled={testLoading || !testForm.messageId}
                style={{
                  background: '#3b82f6',
                  color: 'white',
                  border: 'none',
                  padding: '12px 20px',
                  borderRadius: 8,
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer',
                  marginBottom: 20
                }}
              >
                {testLoading ? 'Creating Draft...' : 'Create Test Draft'}
              </button>

              {testResult && (
                <div style={{
                  padding: 16,
                  background: testResult.error ? '#fef2f2' : '#f0fdf4',
                  border: `1px solid ${testResult.error ? '#fecaca' : '#bbf7d0'}`,
                  borderRadius: 8
                }}>
                  <h4 style={{ 
                    margin: '0 0 12px 0',
                    color: testResult.error ? '#dc2626' : '#16a34a'
                  }}>
                    {testResult.error ? 'Error' : 'Success'}
                  </h4>
                  <pre style={{ 
                    margin: 0, 
                    whiteSpace: 'pre-wrap', 
                    fontSize: 14,
                    background: 'rgba(255,255,255,0.5)',
                    padding: 12,
                    borderRadius: 4
                  }}>
                    {JSON.stringify(testResult, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {!signedIn && (
        <div style={{
          textAlign: 'center',
          padding: 60,
          background: 'white',
          border: '1px solid #e5e7eb',
          borderRadius: 12
        }}>
          <h2>Get Started</h2>
          <p style={{ color: '#666', marginBottom: 24 }}>
            Sign in with your Microsoft 365 account to start using AI-powered email responses
          </p>
          <a href="/api/auth/login" style={{
            background: '#3b82f6',
            color: 'white',
            padding: '12px 24px',
            borderRadius: 8,
            textDecoration: 'none',
            fontWeight: 600
          }}>
            Sign In with Microsoft
          </a>
        </div>
      )}
    </main>
  );
}