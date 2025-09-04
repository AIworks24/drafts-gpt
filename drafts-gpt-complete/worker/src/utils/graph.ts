import axios from 'axios';
const GRAPH=process.env.GRAPH_BASE||'https://graph.microsoft.com/v1.0';
export async function createReplyDraft(token:string,id:string){const {data}=await axios.post(`${GRAPH}/me/messages/${id}/createReply`,{}, {headers:{Authorization:`Bearer ${token}`}});return data;}
export async function updateDraftBody(token:string,draftId:string,html:string){await axios.patch(`${GRAPH}/me/messages/${draftId}`,{body:{contentType:'html',content:html}},{headers:{Authorization:`Bearer ${token}`}});}