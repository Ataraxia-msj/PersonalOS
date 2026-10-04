// @vitest-environment node
import {describe,expect,it,vi} from 'vitest';
import {requestQwenJson} from './qwen-client';

const request={name:'test_schema',schema:{type:'object'},systemPrompt:'parse only',context:{rawText:'测试'},parse:(value:unknown)=>value};
const options={apiKey:'test-only',baseUrl:'https://example.com/v1'};
describe('requestQwenJson',()=>{
  it('times out while reading a response body after headers arrived',async()=>{
    const body=new ReadableStream<Uint8Array>({start(controller){controller.enqueue(new TextEncoder().encode('{'));}});
    await expect(requestQwenJson(request,{...options,fetcher:vi.fn().mockResolvedValue(new Response(body)),timeoutMs:5})).rejects.toMatchObject({code:'provider_timeout'});
  });
  it('does not expose parser failure details',async()=>{
    const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:'{}'}}]})));
    await expect(requestQwenJson({...request,parse:()=>{throw new Error('private provider detail');}},{...options,fetcher})).rejects.toMatchObject({code:'response_invalid',message:'response_invalid'});
  });
  it('rejects multiple choices instead of selecting an arbitrary interpretation',async()=>{
    await expect(requestQwenJson(request,{...options,fetcher:vi.fn().mockResolvedValue(new Response(JSON.stringify({choices:[{},{}]})))})).rejects.toMatchObject({code:'response_invalid'});
  });
});
