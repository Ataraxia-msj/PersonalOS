import {render,screen,waitFor,act} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {expect,it,vi} from 'vitest';
import {CaptureForm} from './capture-form';
import {AffairsNavigationGuard} from './navigation-guard';
vi.mock('next/navigation',()=>({useRouter:()=>({refresh:vi.fn()})}));
it.each(['dirty','pending','uncertain'] as const)('guards browser Back and Forward for %s forms before route listeners run',async status=>{
 window.history.replaceState({__NA:true},'', '/affairs');
 const view=render(<><AffairsNavigationGuard/><CaptureForm action={async()=> status==='pending'?await new Promise(()=>{}):{status:'uncertain',receipt:null,fieldErrors:{},message:'未知'}}/></>);
 window.history.pushState({__NA:true},'', '/affairs/inbox');
 const earlier=window.history.state;
 window.history.pushState({__NA:true},'', '/affairs/projects');
 const current=window.history.state;
 await userEvent.type(screen.getByLabelText('收集内容'),'Protected');
 if(status!=='dirty')await userEvent.click(screen.getByRole('button',{name:'放入收集箱'}));
 if(status==='uncertain')await screen.findByText('未知');
 const confirm=vi.spyOn(window,'confirm').mockReturnValue(false),go=vi.spyOn(window.history,'go').mockImplementation(()=>{}),routeListener=vi.fn();window.addEventListener('popstate',routeListener);
 act(()=>window.dispatchEvent(new PopStateEvent('popstate',{state:earlier})));
 expect(routeListener).not.toHaveBeenCalled();expect(go).toHaveBeenCalledWith(1);
 act(()=>window.dispatchEvent(new PopStateEvent('popstate',{state:current})));
 expect(routeListener).not.toHaveBeenCalled();
 const later={...current,__affairsHistoryIndex:current.__affairsHistoryIndex+1};
 act(()=>window.dispatchEvent(new PopStateEvent('popstate',{state:later})));
 expect(go).toHaveBeenLastCalledWith(-1);expect(routeListener).not.toHaveBeenCalled();
 act(()=>window.dispatchEvent(new PopStateEvent('popstate',{state:current})));
 if(status==='dirty') {confirm.mockReturnValue(true);act(()=>window.dispatchEvent(new PopStateEvent('popstate',{state:earlier})));await waitFor(()=>expect(routeListener).toHaveBeenCalledTimes(1));}
 window.removeEventListener('popstate',routeListener);view.unmount();confirm.mockRestore();go.mockRestore();
});
