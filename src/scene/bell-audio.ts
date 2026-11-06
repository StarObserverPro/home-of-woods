/** The ordinary doorbell owns no clock or reward. Audio is unlocked only by a user action. */
export function createDoorbellAudio(){
  let context:AudioContext|null=null,disposed=false;
  return {
    ring(){
      if(disposed||typeof window==='undefined')return;
      try{
        context??=new AudioContext();
        const audio=context;
        void audio.resume().then(()=>{
          if(disposed||audio.state==='closed')return;
          const start=audio.currentTime;
          // Two slightly irregular wooden clinks, rather than a sustained musical loop.
          for(const [delay,frequency,strength] of [[0,740,.08],[.11,1110,.045],[.18,680,.035]]){
            const tone=audio.createOscillator(),gain=audio.createGain();
            tone.type='sine';tone.frequency.setValueAtTime(frequency,start+delay);
            tone.frequency.exponentialRampToValueAtTime(frequency*.82,start+delay+.23);
            gain.gain.setValueAtTime(.0001,start+delay);
            gain.gain.exponentialRampToValueAtTime(strength,start+delay+.007);
            gain.gain.exponentialRampToValueAtTime(.0001,start+delay+.27);
            tone.connect(gain);gain.connect(audio.destination);
            tone.start(start+delay);tone.stop(start+delay+.3);
            tone.onended=()=>{tone.disconnect();gain.disconnect();};
          }
        }).catch(()=>{});
      }catch{/* The visible mechanical swing remains available when audio is unavailable. */}
    },
    dispose(){if(disposed)return;disposed=true;if(context)void context.close().catch(()=>{});context=null;},
  };
}
