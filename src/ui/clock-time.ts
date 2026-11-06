/** Format the existing world's fractional hour; this does not keep another clock. */
export function formatClockTime(hour:number):string{
  if(!Number.isFinite(hour))return '--:--';
  const minutes=((Math.floor(hour*60+1e-7)%1440)+1440)%1440;
  return `${String(Math.floor(minutes/60)).padStart(2,'0')}:${String(minutes%60).padStart(2,'0')}`;
}
