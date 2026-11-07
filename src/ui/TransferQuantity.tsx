export type TransferAmount=1|5|'max';
export function TransferQuantity({value,onChange}:{value:TransferAmount;onChange:(value:TransferAmount)=>void}){
  return <label className="transfer-quantity">搬运数量 <select aria-label="搬运数量" value={value} onChange={event=>onChange(event.target.value==='max'?'max':Number(event.target.value) as 1|5)}><option value="1">1 份</option><option value="5">5 份</option><option value="max">尽量多</option></select></label>;
}
export const transferAmount=(amount:TransferAmount,stock:number)=>amount==='max'?'max':Math.min(amount,stock);
