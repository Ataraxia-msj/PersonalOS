// @vitest-environment node
import {describe, expect, it, vi} from 'vitest';
import {classifyAgentMessage} from './intent';

const response=(content:unknown)=>new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(content)}}]}));
describe('classifyAgentMessage',()=>{
  it.each(['finance','affairs','mixed','unsupported'] as const)('classifies %s using only raw input',async domain=>{
    const fetcher=vi.fn<typeof fetch>().mockResolvedValue(response({domain}));
    expect(await classifyAgentMessage('面试在10月8日10:30',{apiKey:'test-only',baseUrl:'https://example.com/v1',fetcher})).toBe(domain);
    const body=JSON.parse(String(fetcher.mock.calls[0]![1]!.body));
    expect(JSON.parse(body.messages[1].content)).toEqual({rawText:'面试在10月8日10:30'});
    expect(body.response_format.json_schema.strict).toBe(true);
  });
  it.each([{domain:'delete'}, {domain:'affairs',operation:'complete_affairs_task'}, {}, {domain:null}])('rejects unsafe classification %j',async value=>{
    await expect(classifyAgentMessage('记录任务',{apiKey:'test-only',baseUrl:'https://example.com/v1',fetcher:vi.fn().mockResolvedValue(response(value))})).rejects.toMatchObject({code:'response_invalid'});
  });
  it.each(['', '字'.repeat(4001)])('rejects invalid input without sending a request',async rawText=>{
    const fetcher=vi.fn();
    await expect(classifyAgentMessage(rawText,{apiKey:'test-only',baseUrl:'https://example.com/v1',fetcher})).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
});
