export type QwenProviderErrorCode = 'configuration_missing' | 'provider_rejected' | 'provider_timeout' | 'response_incomplete' | 'response_invalid';
export class QwenProviderError extends Error {
  constructor(readonly code:QwenProviderErrorCode) {super(code);this.name='QwenProviderError';}
}
export interface QwenClientOptions {apiKey?:string;baseUrl?:string;model?:string;fetcher?:typeof fetch;timeoutMs?:number;}
interface JsonRequest<T> {name:string;schema:object;systemPrompt:string;context:unknown;parse:(value:unknown)=>T;maxTokens?:number;}
function record(value:unknown):value is Record<string,unknown> {return typeof value==='object'&&value!==null&&!Array.isArray(value);}
export async function requestQwenJson<T>(request:JsonRequest<T>, options:QwenClientOptions={}):Promise<T> {
  const apiKey=options.apiKey??process.env.DASHSCOPE_API_KEY??'';
  const baseUrl=(options.baseUrl??process.env.QWEN_BASE_URL??'').replace(/\/+$/,'');
  const model=options.model??process.env.QWEN_MODEL??'qwen3.7-flash-2026-07-15';
  if(!apiKey||!baseUrl||!model)throw new QwenProviderError('configuration_missing');
  const controller=new AbortController();
  let timeout:ReturnType<typeof setTimeout>|undefined;
  const expired=new Promise<never>((_resolve,reject)=>{
    timeout=setTimeout(()=>{controller.abort();reject(new QwenProviderError('provider_timeout'));},options.timeoutMs??30_000);
  });
  const read=async()=>{
    const response=await (options.fetcher??fetch)(`${baseUrl}/chat/completions`,{
      method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},signal:controller.signal,
      body:JSON.stringify({enable_thinking:false,max_completion_tokens:request.maxTokens??4096,
        messages:[{role:'system',content:request.systemPrompt},{role:'user',content:JSON.stringify(request.context)}],model,
        response_format:{type:'json_schema',json_schema:{name:request.name,schema:request.schema,strict:true}},stream:false,temperature:0.1}),
    });
    if(!response.ok)throw new QwenProviderError('provider_rejected');
    let payload:unknown;
    try {payload=await response.json();}catch {throw new QwenProviderError('response_invalid');}
    if(!record(payload)||!Array.isArray(payload.choices)||payload.choices.length!==1)throw new QwenProviderError('response_invalid');
    const choice:unknown=payload.choices[0];
    if(!record(choice))throw new QwenProviderError('response_invalid');
    if(choice.finish_reason!=='stop')throw new QwenProviderError('response_incomplete');
    if(!record(choice.message)||typeof choice.message.content!=='string')throw new QwenProviderError('response_invalid');
    try {return request.parse(JSON.parse(choice.message.content));}catch {throw new QwenProviderError('response_invalid');}
  };
  try {return await Promise.race([read(),expired]);}
  catch(error){
    if(controller.signal.aborted)throw new QwenProviderError('provider_timeout');
    if(error instanceof QwenProviderError)throw error;
    throw new QwenProviderError('provider_rejected');
  } finally {clearTimeout(timeout);}
}
