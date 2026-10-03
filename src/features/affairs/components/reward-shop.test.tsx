import {render,screen} from '@testing-library/react';import userEvent from '@testing-library/user-event';import {it,expect,vi} from 'vitest';
import {RewardShop} from './reward-shop';import type {AffairsReward} from '../types';
vi.mock('next/navigation',()=>({useRouter:()=>({refresh:vi.fn()})}));
it('empty shop has no default products',()=>{render(<RewardShop data={{balance:0,rewards:[],redemptions:[]}} action={vi.fn()}/>);expect(screen.getAllByRole('link',{name:'添加奖励'}).length).toBeGreaterThan(0);expect(screen.queryByText('一杯咖啡')).not.toBeInTheDocument();});
it('shows only a preview deduction until confirmed by database',async()=>{const reward={id:'r',revision:'1',name:'Mine',description:null,priceCoins:3,isActive:true} as AffairsReward;render(<RewardShop data={{balance:7,rewards:[reward],redemptions:[]}} action={vi.fn()}/>);await userEvent.click(screen.getByRole('button',{name:'兑换'}));expect(screen.getByText('预计兑换后 4 金币')).toBeVisible();expect(screen.getByText('7 金币')).toBeVisible();expect(screen.getByRole('button',{name:'确认兑换 · 3 金币'})).toBeEnabled();});
it('does not permit overspending',async()=>{const reward={id:'r',revision:'1',name:'Mine',priceCoins:3,isActive:true} as AffairsReward;render(<RewardShop data={{balance:1,rewards:[reward],redemptions:[]}} action={vi.fn()}/>);await userEvent.click(screen.getByRole('button',{name:'兑换'}));expect(screen.getByRole('button',{name:'确认兑换 · 3 金币'})).toBeDisabled();});
it('does not auto-adopt changed prices; explicit reconfirmation creates a new request',async()=>{
 const reward={id:'r',revision:'1',name:'Mine',priceCoins:3,isActive:true} as AffairsReward;const requests:FormData[]=[];
 const action=vi.fn(async(_s,d:FormData)=>{requests.push(d);return {status:'error' as const,fieldErrors:{},message:'奖励价格或版本已变化',receipt:null};});
 const view=render(<RewardShop data={{balance:7,rewards:[reward],redemptions:[]}} action={action}/>);
 await userEvent.click(screen.getByRole('button',{name:'兑换'}));await userEvent.click(screen.getByRole('button',{name:'确认兑换 · 3 金币'}));await screen.findByText('奖励价格或版本已变化');
 view.rerender(<RewardShop data={{balance:7,rewards:[{...reward,revision:'2',priceCoins:5}],redemptions:[]}} action={action}/>);
 expect(requests).toHaveLength(1);expect(screen.getByText('预计兑换后 4 金币')).toBeVisible();
 await userEvent.click(screen.getByRole('button',{name:'查看最新商品并重新确认'}));await userEvent.click(screen.getByRole('button',{name:'确认兑换 · 5 金币'}));
 expect(requests[0].get('confirmed_price')).toBe('3');expect(requests[1].get('confirmed_price')).toBe('5');expect(requests[0].get('requestId')).not.toBe(requests[1].get('requestId'));
});
