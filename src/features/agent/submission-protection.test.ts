import {beforeEach,it,expect} from 'vitest';
import {readSubmissionProtection,writeSubmissionProtection,clearSubmissionProtection,type SubmissionMarker} from './submission-protection';
import {id} from '@/lib/agent/conversation/test-fixtures';
const marker:SubmissionMarker={ownerId:id(20),batchId:id(22),draftId:id(10),requestId:null,type:'expense',status:'saving',submittedAt:'2026-10-11T00:00:00.000Z'};
beforeEach(()=>sessionStorage.clear());
it('stores only the minimum marker and isolates owners',()=>{
 writeSubmissionProtection(sessionStorage,marker);expect(readSubmissionProtection(sessionStorage,id(20))).toEqual(marker);expect(readSubmissionProtection(sessionStorage,id(21))).toBeNull();
 const text=sessionStorage.getItem(`personal-os:agent:finance-submission:${id(20)}`)!;
 for(const word of ['amount','account','rawText','token'])expect(text).not.toContain(word);
 clearSubmissionProtection(sessionStorage,id(20));expect(readSubmissionProtection(sessionStorage,id(20))).toBeNull();
});
it('rejects corrupt or extraneous fields instead of silently removing protection',()=>{
 sessionStorage.setItem(`personal-os:agent:finance-submission:${id(20)}`,JSON.stringify({...marker,amount:20}));
 expect(()=>readSubmissionProtection(sessionStorage,id(20))).toThrow();
});
