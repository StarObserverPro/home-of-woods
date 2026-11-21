import {RIDGE_NEIGHBOUR,NPC_MEMORY_RULES} from '../content/npcs/ridge-neighbour/profile.ts';
import {NPC_VISIT} from '../content/npc-visit.ts';
import {HOME} from '../content/world.ts';
import {WORKBENCH} from '../content/workshop.ts';
import {CAMP_PROPS} from '../content/scene-props.ts';
import {createNpcs} from '../domain/npcs.ts';
import {calendarAt} from '../domain/local-clock.ts';
import {canStand,findPath,move} from '../domain/navigation.ts';
import {travelAccess} from '../world/regions.ts';
import type {Collider} from '../world/layout.ts';
import type {GameState} from '../domain/state.ts';
import {consolidateNpcMemory,rememberNpcEvent,recordNpcDialogue,recordNpcPromise,resolveNpcPromise,memoryConsolidationRequest,applyMemoryConsolidation,recallNpcMemories} from '../domain/npc-memory.ts';
import {createNpcDialogueSession,advanceNpcDialogue,isNpcSessionCurrent,npcModelRequest,acceptNpcDecision} from '../domain/npc-dialogue.ts';
import type {NpcDialogueSession,NpcDecision,NpcSituation,NpcCapability} from '../domain/npc-dialogue.ts';
import {tickNpcVisit,interactNpcVisit,npcVisitClockReason,npcVisitSleepReason,npcVisitSnapshot,settleNpcVisitForSleep,applyNpcVisitPlan} from '../domain/npc-visit.ts';
import type {NpcActivityTarget,NpcVisitEvent,NpcVisitInteraction} from '../domain/npc-visit.ts';
import {weatherSnapshot} from '../domain/weather.ts';

export type NeighbourView={
  id:string;name:string;visible:boolean;phase:string;status:string;line:string;near:boolean;distance:number;
  focused:boolean;clockReason:string;sleepReason:string;canPromise:boolean;
  history:{role:'player'|'npc';text:string}[];
  activities:{id:string;label:string;available:boolean;reason:string}[];
};
export const emptyNeighbourView=():NeighbourView=>({id:RIDGE_NEIGHBOUR.id,name:RIDGE_NEIGHBOUR.name,visible:false,phase:'absent',status:'山那边的邻居',line:'',near:false,distance:0,focused:false,clockReason:'',sleepReason:'',canPromise:false,history:[],activities:[]});

/** App-owned adapter: one calendar, one navigation world, one persistent per-person record. */
export function createNpcSession(state:GameState,colliders:()=>Collider[],notify:(message:string)=>void){
  let focused=false,session:NpcDialogueSession|null=null;
  let pendingInput:string|null=null;
  let memoryDeltas:string[]=[];
  const record=()=>{state.npcs??=createNpcs(state.time);return state.npcs['ridge-neighbour'];};
  const day=()=>calendarAt(state.time).day;
  const distance=()=>{const visit=record().visit.active;return visit?Math.hypot(state.player.x-visit.position.x,state.player.z-visit.position.z):Infinity;};
  const activities=():NpcActivityTarget[]=>{
    const blockers=colliders(),access=travelAccess(state);
    const work={x:WORKBENCH.x+2,z:WORKBENCH.z+2.4},fire={x:CAMP_PROPS.fire.x+2.5,z:CAMP_PROPS.fire.z-1.5};
    return [
      {id:'neighbour:workbench',abilityId:'observe-workbench',label:'看看工作台',target:work,available:canStand(work,blockers,undefined,access),reason:'工作台旁暂时没有站脚的地方，等腾出空地再看吧。',durationSeconds:8},
      {id:'neighbour:fire',abilityId:'warm-fire',label:'在火塘边暖一会儿',target:fire,available:canStand(fire,blockers,undefined,access),reason:'火塘旁有点挤，我先在外边等一会儿。',durationSeconds:10},
      {id:'neighbour:seat',abilityId:'rest-seat',label:'坐下歇脚',target:work,available:false,reason:'还没有适合我歇脚的位置，我先站一会儿。'},
      {id:'neighbour:meal',abilityId:'share-meal',label:'一起吃饭',target:fire,available:false,autonomous:false,reason:'还没备好我的那一份，你先吃吧。'},
      {id:'neighbour:dance',abilityId:'dance',label:'跳一段舞',target:work,available:false,autonomous:false,reason:'跳舞我还真不太会，我听你唱就好。'},
    ];
  };
  const environment=(dt=0)=>({time:state.time,dt,player:state.player,playerInCamp:Math.hypot(state.player.x-HOME.x,state.player.z-HOME.z)<38,hostFocused:focused,activities:activities(),
    planRoute:(from:{x:number;z:number},to:{x:number;z:number})=>findPath(from,to,colliders(),travelAccess(state)),
    move:(from:{x:number;z:number},dx:number,dz:number)=>move(from,dx,dz,colliders(),travelAccess(state))});
  const situation=():NpcSituation=>({day:day(),hostBusy:focused,visitOpen:!!record().visit.active&&record().visit.active?.phase!=='leaving',
    weather:weatherSnapshot(state).name,
    visibleFacts:['营地有一张工作台和一处火塘。'],
    capabilities:[...(['greet','talk','roam','goodbye'] as const).map(intent=>({intent,available:true})),
      ...activities().map(item=>({intent:item.abilityId as NpcCapability['intent'],targetId:item.id,available:item.available,reason:item.reason,label:item.label}))]});
  function ensureSession(){
    const npc=record(),visit=npc.visit.active;
    if(!visit){session=null;return null;}
    if(!session||session.visitId!==visit.id||!isNpcSessionCurrent(session,npc.memory)){
      session=createNpcDialogueSession(RIDGE_NEIGHBOUR,npc.memory,visit.id,situation());pendingInput=null;memoryDeltas=[];
    }
    return session;
  }
  function updateSessionMemory(id:string){
    const npc=record(),card=npc.memory.memories.find(item=>item.id===id);
    if(!session||session.visitId!==npc.visit.active?.id||!card)return;
    const recall=recallNpcMemories({...npc.memory,memories:[card]})[0];
    session.context.memories=session.context.memories.filter(item=>item.id!==id);
    if(recall)session.context.memories=[...session.context.memories,recall].slice(-NPC_MEMORY_RULES.maxMemories);
    memoryDeltas=[...memoryDeltas,JSON.stringify({kind:'memory-update',id,recall:recall??null})].slice(-NPC_MEMORY_RULES.maxMemories);
  }
  function remember(events:NpcVisitEvent[]){
    const npc=record();
    for(const event of events){
      if(event.type==='started')ensureSession();
      if(event.type==='engaged'){
        npc.memory=rememberNpcEvent(npc.memory,{id:`${event.visitId}:greeting`,kind:'observation',topic:'visits',gist:'翻过山到营地，和主人打了招呼。',day:day(),importance:1});
        updateSessionMemory(`${event.visitId}:greeting`);
      }
      if(event.type==='activity-finished'){
        // A shared, completed event can become a memory; route nodes never do.
        if(event.shared)npc.memory=rememberNpcEvent(npc.memory,{id:`${event.visitId}:${event.abilityId}`,kind:'shared-activity',topic:event.abilityId??'camp',
          gist:event.abilityId==='observe-workbench'?'和主人一起看过营地的木作。':'和主人在营地的火塘边待了一会儿。',day:day(),importance:2});
        updateSessionMemory(`${event.visitId}:${event.abilityId}`);
        if(event.abilityId==='observe-workbench')for(const promise of npc.memory.promises){
          if(promise.status==='open'&&promise.id.endsWith(':woodwork-promise')&&!promise.id.startsWith(`${event.visitId}:`))npc.memory=resolveNpcPromise(npc.memory,promise.id,'fulfilled',day());
        }
      }
      if(event.type==='left'){
        session=null;pendingInput=null;
        if(state.selected===RIDGE_NEIGHBOUR.id)state.selected=null;
      }
      // Busy visitors do not open a panel or interrupt the player's full-screen activity.
      if(event.message&&!focused)notify(`${RIDGE_NEIGHBOUR.name}：${event.message}`);
    }
  }
  function clockGuard(){if(npcVisitClockReason(record().visit,state.clock.speed,focused))state.clock={speed:1};}
  function cancelPendingDialogue(){
    if(pendingInput!==null&&session)session={...session,turn:session.turn+1};
    pendingInput=null;
  }
  function command(action:NpcVisitInteraction,activityId?:string){
    if(action!=='talk')cancelPendingDialogue();
    const result=interactNpcVisit(record().visit,action,environment(),activityId);
    remember(result.events);clockGuard();
    if(result.message)notify(`${RIDGE_NEIGHBOUR.name}：${result.message}`);
    return result;
  }
  function completeDecision(input:string,result:{session:NpcDialogueSession;decision:NpcDecision}){
    session=result.session;pendingInput=null;
    const decision=result.decision,visit=record().visit.active;
    if(!visit)return decision;
    if(decision.kind==='action'&&decision.intent){
      const intent=decision.intent;
      const response=command(['greet','talk','roam','goodbye'].includes(intent)?intent as NpcVisitInteraction:'activity',decision.targetId??intent);
      if(!response.ok){decision.kind='unavailable';decision.utterance=response.message;delete decision.intent;delete decision.targetId;}
    }
    visit.lastMessage=decision.utterance;
    if(session.history.length)session.history[session.history.length-1]={role:'npc',text:decision.utterance};
    if(input&&session.history.length>=2&&session.history[session.history.length-2].role==='player')session.history[session.history.length-2]={role:'player',text:input};
    if(input&&['reply','action'].includes(decision.kind)){
      const npc=record();
      npc.memory=recordNpcDialogue(npc.memory,{day:day(),player:input,npc:decision.utterance});
      const topic=/上回|上次|记得|答应|承诺|约定/.test(input)?null:/凳|椅|木|门|桌|作品|工件/.test(input)?'woodwork':/汤|饭|蘑菇|锅|碗/.test(input)?'food':null;
      if(topic)npc.memory=rememberNpcEvent(npc.memory,{id:`${visit.id}:conversation:${topic}`,kind:'conversation',topic,gist:topic==='woodwork'?'和主人聊过营地里的木作。':'和主人聊过营地的饭食。',
        details:[{id:'topic',text:`主人当时说：“${input.slice(0,100)}”`}],day:day(),importance:2});
      if(topic)updateSessionMemory(`${visit.id}:conversation:${topic}`);
    }
    notify(`${RIDGE_NEIGHBOUR.name}：${decision.utterance}`);
    if(visit.leaveRequested&&visit.phase==='talking')command('finish-talk');
    clockGuard();return decision;
  }
  function beginTalking(){
    if(!record().visit.active||focused||distance()>NPC_VISIT.interactionReach){notify('走近邻居、收起手上的活，再和他说话。');return false;}
    const response=interactNpcVisit(record().visit,'talk',environment());remember(response.events);clockGuard();return response.ok;
  }
  return {
    tick(dt:number){
      const npc=record();
      // Local fallback performs the same periodic transaction that a future AI worker will propose.
      npc.memory=consolidateNpcMemory(npc.memory,day(),state.seed);
      if(session&&!isNpcSessionCurrent(session,npc.memory)){session=null;pendingInput=null;}
      remember(tickNpcVisit(npc.visit,environment(dt)));clockGuard();
    },
    guardClock:clockGuard,
    clockReason:(speed:0|1|4|12)=>npcVisitClockReason(record().visit,speed,focused),
    sleepReason:()=>npcVisitSleepReason(record().visit),
    afterSleep(){remember(settleNpcVisitForSleep(record().visit,state.time));record().memory=consolidateNpcMemory(record().memory,day(),state.seed);session=null;pendingInput=null;},
    setHostFocused(value:boolean){focused=value;if(value){cancelPendingDialogue();remember(tickNpcVisit(record().visit,environment()));}clockGuard();},
    command,
    closeConversation(){cancelPendingDialogue();if(record().visit.active?.phase==='talking')command('finish-talk');},
    talk(input:string){
      if(typeof input!=='string'||!input.trim()||input.length>240||!beginTalking())return null;
      const current=ensureSession();return current?completeDecision(input,advanceNpcDialogue(current,input,situation())):null;
    },
    promiseWoodwork(){
      if(!beginTalking())return false;
      const npc=record(),visit=npc.visit.active!;
      const promiseId=`${visit.id}:woodwork-promise`,memoryId=`${visit.id}:promise`;
      if(npc.memory.promises.some(p=>p.status==='open'&&p.id.endsWith(':woodwork-promise'))){notify('这件事已经约好了。');return false;}
      npc.memory=recordNpcPromise(npc.memory,{id:promiseId,memoryId,madeDay:day(),dueDay:null,description:'阿榆下次来访时，再看看营地工作台。'});
      npc.memory=rememberNpcEvent(npc.memory,{id:memoryId,kind:'promise',topic:'woodwork-promise',gist:'和主人约过再看看营地的木作。',details:[{id:'when',text:'约好下次来访时看工作台。',alternatives:[{id:'later-visit',text:'似乎约的是以后哪次顺路时，再看工作台。'}]}],day:day(),importance:3});
      updateSessionMemory(memoryId);
      const line='好，下回过来，再看看你这儿的木作。';visit.lastMessage=line;
      const current=ensureSession();if(current)session={...current,turn:current.turn+1,history:[...current.history,{role:'player',text:'下次再来看看木作吧。'},{role:'npc',text:line}].slice(-6) as NpcDialogueSession['history']};
      pendingInput=null;notify(`${RIDGE_NEIGHBOUR.name}：${line}`);return true;
    },
    approach(){
      const visit=record().visit.active;if(!visit)return false;
      const blockers=colliders(),access=travelAccess(state);
      const meetingPoint=visit.phase==='arriving'?visit.greeting:visit.activity&&!visit.activity.started?visit.activity.target:visit.position;
      for(const offset of [0,.8,-.8,1.6,-1.6,Math.PI]){
        const angle=Math.atan2(state.player.z-meetingPoint.z,state.player.x-meetingPoint.x)+offset;
        const target={x:meetingPoint.x+Math.cos(angle)*2.1,z:meetingPoint.z+Math.sin(angle)*2.1};
        if(!canStand(target,blockers,undefined,access))continue;
        const route=findPath(state.player,target,blockers,access);if(!route.length)continue;
        state.route=route;state.selected=RIDGE_NEIGHBOUR.id;notify(visit.phase==='arriving'?'到营地空地等阿榆过来。':'走近阿榆。');return true;
      }
      notify('这会儿走不过去，等他到空地再打招呼吧。');return false;
    },
    snapshot():NeighbourView{
      const npc=record(),view=npcVisitSnapshot(npc.visit,state.time,focused),visit=view.active;
      if(!visit)return emptyNeighbourView();
      const status={arriving:'正沿小路过来',waiting:'在营地歇脚',wandering:'在周围看看',talking:'正在交谈',activity:visit.activity?.label??'在营地活动',leaving:'正在回家'}[visit.phase];
      return {id:RIDGE_NEIGHBOUR.id,name:RIDGE_NEIGHBOUR.name,visible:true,phase:visit.phase,status,line:visit.lastMessage,near:distance()<=NPC_VISIT.interactionReach,distance:distance(),focused,
        clockReason:view.clockReason,sleepReason:view.sleepReason,canPromise:!npc.memory.promises.some(p=>p.status==='open'&&p.id.endsWith(':woodwork-promise')),
        history:session?.visitId===visit.id?session.history.map(item=>({...item})):[],activities:activities().filter(item=>['observe-workbench','warm-fire'].includes(item.abilityId)).map(item=>({id:item.id,label:item.label,available:item.available,reason:item.available?'':item.reason??''}))};
    },
    /** Provider-neutral seams. The secure transport is intentionally not installed in this prototype. */
    dialogueRequest(input:string){
      if(!input.trim()||input.length>240||pendingInput!==null||!beginTalking())return null;
      const current=ensureSession();if(!current)return null;
      const local=advanceNpcDialogue(current,input,situation());
      if(local.decision.kind!=='reply'){completeDecision(input,local);return null;}
      const next=npcModelRequest(current,'dialogue',{input,situation:situation(),events:memoryDeltas});session=next.session;memoryDeltas=[];pendingInput=input;return next.request;
    },
    acceptDialogue(raw:unknown){
      if(pendingInput===null||!session||!isNpcSessionCurrent(session,record().memory)||session.visitId!==record().visit.active?.id||focused||record().visit.active?.phase!=='talking'||distance()>NPC_VISIT.interactionReach)return false;
      if(!raw||typeof raw!=='object'||!('visitId'in raw)||!('turn'in raw)||!('memoryEpoch'in raw)||raw.visitId!==session.visitId||raw.turn!==session.turn||raw.memoryEpoch!==session.memoryEpoch)return false;
      const input=pendingInput;
      completeDecision(input,acceptNpcDecision(session,raw,situation()));return true;
    },
    failDialogue(){
      if(pendingInput===null||!session)return false;
      if(focused||record().visit.active?.phase!=='talking'||distance()>NPC_VISIT.interactionReach){cancelPendingDialogue();return false;}
      const input=pendingInput;completeDecision(input,advanceNpcDialogue(session,input,situation()));return true;
    },
    planRequest(){
      const current=ensureSession(),visit=record().visit.active;if(!current||!visit||visit.phase==='leaving'||visit.plan.source==='model')return null;
      return {role:'planner',modelTier:'light',visitId:visit.id,expectedRevision:visit.plan.revision,context:structuredClone(current.context),situation:situation(),
        outputContract:{visitId:visit.id,expectedRevision:visit.plan.revision,wishes:'Up to four supplied autonomous activity IDs; unavailable wishes are skipped in the world.'}};
    },
    acceptPlan(proposal:unknown){
      if(!proposal||typeof proposal!=='object'||!('visitId'in proposal)||!('expectedRevision'in proposal)||!('wishes'in proposal)||typeof proposal.visitId!=='string'||typeof proposal.expectedRevision!=='number'||!Array.isArray(proposal.wishes))return false;
      return applyNpcVisitPlan(record().visit,proposal as Parameters<typeof applyNpcVisitPlan>[1],environment());
    },
    memoryRequest:()=>memoryConsolidationRequest(record().memory,day()),
    acceptMemory(proposal:unknown){
      if(!proposal||typeof proposal!=='object'||!('atDay'in proposal)||proposal.atDay!==day())return false;
      try{record().memory=applyMemoryConsolidation(record().memory,proposal);session=null;pendingInput=null;return true;}catch{return false;}
    },
    reset(){session=null;pendingInput=null;memoryDeltas=[];focused=false;},
  };
}
