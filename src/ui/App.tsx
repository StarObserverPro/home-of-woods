import {mountGameTimber} from './timber/game-adapter.ts';
import {useWindowFocus} from './timber/use-window-focus.ts';
import './timber/theme.css';
import './timber/game-layout.css';
import {ItemBrowser,ItemHeading,MenuAction,IconTabs,TextPages} from './ItemBrowser.tsx';
import {ownedIcon} from './art-icons.ts';
import {CraftingMenu} from './CraftingMenu.tsx';
import {BridgeControls} from './Bridge.tsx';
import {CREEK_BRIDGE} from '../content/regions.ts';
import {gatheringHostTrees} from '../world/gathering-layout.ts';
import {CarryingControls,CarryingSummary,carryingDetails,GroundCarryControls} from './Carrying.tsx';
import {RarityVfxControls} from './RarityVfxControls.tsx';
import {readRarityVfxPreference,writeRarityVfxPreference,readWhimsyPreference,writeWhimsyPreference} from '../app/display-preferences.ts';
import {WhimsyControls} from './WhimsyControls.tsx';
import type {WhimsyMode} from '../content/whimsy-display.ts';
import type {RarityVfxMode} from '../content/item-vfx.ts';
import {rarityStyle} from './rarity.ts';
import {itemRarity} from '../domain/item-properties.ts';
import {woodcraftDetails,WoodcraftControls,WoodDropControls} from './Woodcraft.tsx';
import {emptyWoodcraftSnapshot} from '../app/woodcraft-session.ts';
import {workshopDetails,Hourglass,WorkshopControls,PlacementControls} from './Workshop.tsx';
import {calendarAt} from '../domain/local-clock.ts';
import {formatClockTime} from './clock-time.ts';
import {merchantVisitAt} from '../content/merchant.ts';
import {MerchantShop} from './MerchantShop.tsx';
import {WORKBENCH,findBlueprint} from '../content/workshop.ts';
import {CAMP_VISITOR} from '../content/characters.ts';
import {treeVisual} from '../world/tree-appearance.ts';
import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { createRuntime } from "../app/runtime.ts";
import type { Runtime, Snapshot } from "../app/runtime.ts";
import type { GameState } from "../domain/state.ts";
import { WAYPOINTS, PATH, RIVER_KNOTS, GIANT, HOME, START, WORLD_SEED } from "../content/world.ts";
import { makeTrees } from "../world/layout.ts";
import { recordCanvas } from "../app/recorder.ts";
import { Warehouse } from './Warehouse.tsx';
import {FoodControls} from './FoodControls.tsx';
import {EveningControls,ForestReader} from './Evening.tsx';
import { Wardrobe } from './Wardrobe.tsx';
import { EMPTY_WARDROBE_VIEW } from '../domain/wardrobe.ts';
import { SaveControls } from './SaveControls.tsx';
import { createSaveController, INITIAL_SAVE_STATUS } from '../app/save-controller.ts';
import type { SaveController } from '../app/save-controller.ts';
import { createBrowserWorldSaveStore } from '../app/world-save-store.ts';
import type {WorldSaveStore} from '../app/world-save-store.ts';
import { createSaveContext } from '../domain/save-context.ts';
import {sceneAppearanceAt,scenePropDetails} from '../domain/scene-props.ts';
import {WardrobeLab} from './WardrobeLab.tsx';
import {SceneInspector} from './SceneInspector.tsx';
import {BlueprintLibrary,UpgradeControls} from './Blueprints.tsx';
import {useItemDrag} from './useItemDrag.ts';
import {furnitureGeometry} from '../domain/furniture-placement.ts';
import './running.css';
import {WeatherControls,WeatherWorkNotice} from './WeatherControls.tsx';
import {WOODCRAFT} from '../content/woodcraft.ts';
import {CAMP_PROPS} from '../content/scene-props.ts';
import {GameIcon} from './GameIcon.tsx';
import type {ArtIconName} from './art-icons.ts';
import {HousingControls,housingDetails,isHousingItem} from './Housing.tsx';
import {BroomControls,broomDetails,ItemOracleControls} from './Household.tsx';

function Leaf({ size = 24 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M27 4C12 2 4 8 5 18c.5 7 7 10 13 6C24 20 26 12 27 4Z"
        fill="currentColor"
      />
      <path
        d="m7 27 15-17M12 21l-1-8M15 18l8-1"
        stroke="#f5f0de"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}
const HUD_ART:Record<string,ArtIconName>={pause:'pause',home:'cabin',map:'route',warehouse:'inventory',axe:'axe',help:'settings',camera:'camera'};
function Icon({name}:{name:string}) {
  if(HUD_ART[name])return <GameIcon name={HUD_ART[name]} size={28}/>;
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {name==='walk'?<><circle cx="13" cy="4" r="2"/><path d="m10 9 3-2 3 5 3 1M13 8l-2 7-4 6M11 15l5 6M9 10l-4 3"/></>:name==='reset'?<path d="M4 8a8 8 0 1 1 0 8M4 3v5h5"/>:<path d="m15 6-6 6 6 6"/>}
  </svg>;
}

const trees = makeTrees();
const treeById = new Map(trees.map(tree=>[tree.id,tree]));
const branchHosts=new Set(gatheringHostTrees(trees).map(tree=>tree.id));
const mapX=(x:number)=>(x+90)*.9;
const mapZ=(z:number)=>(z+85)*.9;
const mapLine=(p:{x:number;z:number}[])=>p.map(v=>`${mapX(v.x)},${mapZ(v.z)}`).join(' ');
const empty: Snapshot = {
  weather:null,
  carrying:{weight:0,bulk:0,effort:0,speed:1,reason:'',weightLimit:30,bulkLimit:10,method:'hands',items:[],ground:[],storageNear:false,visual:null},
  interaction:null,
  woodcraft:emptyWoodcraftSnapshot(),
  merchant:{...merchantVisitAt(0),coins:100,debt:0,cargoLeft:100,budgetLeft:800,giftAvailable:false,listings:[],saleables:[]},
  workshop:{blueprints:[],availableBlueprints:[],copyUses:{},offers:[],items:[],job:null,lastResponse:'',calendar:calendarAt(0),speed:1,upgrades:{},mounted:{},upgrade:null,upgradeOptions:[],inputs:{craft:false,offering:false,trade:false,canvas:false,hardware:false,foodSack:false}},
  food:{today:1,heavyWork:true,nextDayReady:false,counts:{},dryingReason:'',dryingProgress:null,cookingProgress:null,cookingOptions:[],cookingName:null,sacksBought:0,mealsEaten:0},
  dayCycle:{day:1,hour:14,speed:1,eveningStopped:false,canSleep:false,sleepReason:'傍晚后才能结束一天。',nearCamp:true,lastEveningStopDay:null,nightsSlept:0,wokeAt:null},
  housing:{plans:[],items:[],hostNear:false,workbenchNear:false},
  guidedWorkshop:{unlocked:false,near:false,plans:[],upgrade:null,upgradeBlueprint:{id:'blueprint.workbench-bracing',name:'工作台支架改良',learned:false},job:null},
  potFoundation:{near:false,plans:[]},
  mealVessels:{nearWorkbench:false,plans:[],bowls:[]},
  broom:{blueprint:{id:'blueprint.branch-broom',name:'枝扫帚',learned:false,canCraft:false,reason:'场景正在准备。',costs:[]},workbenchNear:false,items:[],selectedItemId:null,patches:[]},
  itemOracle:{near:false,stand:{x:-10,z:50},targets:[]},
  life:{mealPlaying:false,broomPlaying:false},
  placement:null,
  zone: "山间营地",
  x: START.x,
  z: START.z,
  height: 21.5,
  selected: null,
  moving: false,
  running: false,
  visited: ["home"],
  paused: false,
  message: "沿着小路，认识你的新家。",
  stats: {},
  forestry: {
    wood: 0,
    points: { year: 1, available: 24, used: 0, reserved: 0 },
    active: null,
    selectedTree: null,
  },
  gathering: { inventory: [], action: null, selectedTarget: null },
  warehouse: { categories: [], items: [], total: 0, occupiedKinds: 0 },
  wardrobe:EMPTY_WARDROBE_VIEW,
  save: INITIAL_SAVE_STATUS,
  appearance:sceneAppearanceAt(0),
};
export function App({review}:{review?:{state:GameState;store:WorldSaveStore}}={}) {
  const host = useRef<HTMLDivElement>(null),
    runtime = useRef<Runtime | null>(null),
    sessionState = useRef<GameState | null>(review?.state??null),
    saveOwner = useRef<SaveController | null>(null),
    pauseDialog = useRef<HTMLDialogElement>(null),
    cameraToggle = useRef<HTMLButtonElement>(null);
  const [snapshot, setSnapshot] = useState(empty),
    [ready, setReady] = useState(false),
    [error, setError] = useState(""),
    [mapOpen, setMapOpen] = useState(false),
    [cameraOpen,setCameraOpen]=useState(false),
    [messageVisible,setMessageVisible]=useState(false),
    [help, setHelp] = useState(false),
    [warehouseOpen, setWarehouseOpen] = useState(false),
    [readerOpen,setReaderOpen]=useState(false),
    [dawnFlash,setDawnFlash]=useState(0),
    [reduced, setReduced] = useState(false),
    [mountVersion, setMountVersion] = useState(0),
    [audit, setAudit] = useState<Record<string, unknown>[]>([]);
  const [rarityVfxMode,setRarityVfxMode]=useState(readRarityVfxPreference);
  const rarityModeRef=useRef(rarityVfxMode);
  const [whimsyMode,setWhimsyMode]=useState(readWhimsyPreference);
  const whimsyModeRef=useRef(whimsyMode);
  const [whimsyNotice,setWhimsyNotice]=useState('');
  const priorNights=useRef<number|null>(null);
  const [displayNotice,setDisplayNotice]=useState('');
  const itemDrag=useItemDrag(
    (item,x,y,toWarehouse)=>runtime.current?.previewTransfer(item,x,y,toWarehouse)??{valid:false,reason:'场景正在准备。'},
    (item,x,y,toWarehouse)=>runtime.current?.transferItem(item,x,y,toWarehouse)??{valid:false,reason:'场景正在准备。'},
  );
  const swallowedPointer=useRef(false);
  const closeWarehouse=()=>{itemDrag.cancel();setWarehouseOpen(false);runtime.current?.setInterfaceOpen(readerOpen);};
  const leaveWarehouse=(action:()=>void)=>{closeWarehouse();action();};
  const openReader=(seatId?:string)=>{
    if(runtime.current?.setReading(true,seatId)){setReaderOpen(true);setMapOpen(false);setHelp(false);}
  };
  function changeRarityVfxMode(mode:RarityVfxMode){
    rarityModeRef.current=mode;setRarityVfxMode(mode);
    runtime.current?.setRarityVfxMode(mode);
    setDisplayNotice(writeRarityVfxPreference(mode)?'':'设置已生效；当前浏览器未能记住这项选择。');
  }
  function changeWhimsyMode(mode:WhimsyMode){
    whimsyModeRef.current=mode;setWhimsyMode(mode);runtime.current?.setWhimsyMode(mode);
    setWhimsyNotice(writeWhimsyPreference(mode)?'':'设置已生效；当前浏览器未能记住这项选择。');
  }
  const diagnostic = new URLSearchParams(window.location.search).has("inspect");
  const [snapshotVersion, setSnapshotVersion] = useState(-1);
  const recording = useRef<(() => void) | null>(null),
    recordUrlRef = useRef("");
  const recordBlob=useRef<Blob|null>(null);
  const recordMode=useRef<'walkthrough'|'forestry'|'gathering'>('walkthrough');
  const [recordSaved,setRecordSaved]=useState('');
  const [recordUrl, setRecordUrl] = useState(""),
    [capturing, setCapturing] = useState(false);
  useEffect(
    () => () => {
      recording.current?.();
      if (recordUrlRef.current) URL.revokeObjectURL(recordUrlRef.current);
    },
    [],
  );
  const startRecording = (mode:'walkthrough'|'forestry'|'gathering'='walkthrough') => {
    const canvas = host.current?.querySelector("canvas");
    if (!canvas || capturing) return;
    recordMode.current=mode;
    recordBlob.current=null;
    if(recordUrlRef.current)URL.revokeObjectURL(recordUrlRef.current);
    recordUrlRef.current='';
    setRecordUrl('');
    setCapturing(true);
    setRecordSaved('');
    if(mode==='walkthrough')runtime.current?.navigate("creek");
    recording.current = recordCanvas(canvas, (blob) => {
      if (recordUrlRef.current) URL.revokeObjectURL(recordUrlRef.current);
      recordUrlRef.current = URL.createObjectURL(blob);
      recordBlob.current=blob;
      setRecordUrl(recordUrlRef.current);
      setCapturing(false);
      recording.current = null;
    });
  };
  const saveRecording=async()=>{
    if(!recordBlob.current||capturing)return;
    try{
      const response=await fetch(`/__evidence/${recordMode.current}`,{method:'POST',headers:{'Content-Type':'video/webm'},body:recordBlob.current});
      if(!response.ok)throw new Error(await response.text());
      const result=await response.json();setRecordSaved(`已保存：${result.saved}（${result.bytes} 字节）`);
    }catch(e){setRecordSaved(`保存失败：${e instanceof Error?e.message:String(e)}`);}
  };
  useEffect(() => {
    let cancelled = false;
    setReady(false);
    setError("");
    saveOwner.current ??= createSaveController(review?.store??createBrowserWorldSaveStore(), createSaveContext());
    createRuntime(host.current!, (value) => {
      if (!cancelled) {
        setSnapshot(value);
        setSnapshotVersion(mountVersion);
        if (value.selected) {
          setMapOpen(false);
          setHelp(false);
        }
      }
    }, sessionState.current ?? undefined, saveOwner.current,rarityModeRef.current,whimsyModeRef.current)
      .then((value) => {
        if (cancelled) {
          value.destroy();
          return;
        }
        runtime.current = value;
        sessionState.current = value.getState();
        setReady(true);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
      const value = runtime.current;
      runtime.current = null;
      if (value) {
        value.destroy();
      }
    };
  }, [mountVersion]);
  useEffect(() => {
    if (snapshot.paused && !pauseDialog.current?.open)
      pauseDialog.current?.showModal();
    else if (!snapshot.paused) pauseDialog.current?.close();
  }, [snapshot.paused]);
  useEffect(() => {
    runtime.current?.setReducedMotion(reduced);
  }, [reduced, ready]);
  useEffect(() => {
    if(!readerOpen)runtime.current?.setReading(false);
    runtime.current?.setInterfaceOpen(warehouseOpen||readerOpen);
    if(!warehouseOpen)itemDrag.cancel();
  },[warehouseOpen,readerOpen,ready]);
  useEffect(()=>{
    if(!ready){priorNights.current=null;return;}
    const count=snapshot.dayCycle.nightsSlept;
    if(priorNights.current!==null&&count>priorNights.current)setDawnFlash(v=>v+1);
    priorNights.current=count;
  },[ready,snapshot.dayCycle.nightsSlept]);
  useEffect(()=>{
    if(!readerOpen)return;
    const close=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();setReaderOpen(false);}};
    document.addEventListener('keydown',close,true);return()=>document.removeEventListener('keydown',close,true);
  },[readerOpen]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if(e.code!=='KeyB'||e.repeat||e.target instanceof HTMLElement && e.target.closest('input,textarea,select,[contenteditable]'))return;
      if(!ready||snapshot.paused||readerOpen)return;
      e.preventDefault();e.stopPropagation();setWarehouseOpen(v=>!v);
    };
    document.addEventListener('keydown',key,true);return()=>document.removeEventListener('keydown',key,true);
  },[ready,snapshot.paused,readerOpen]);
  useEffect(()=>{setCameraOpen(false);},[snapshot.selected]);
  useEffect(()=>{
    if(warehouseOpen){setMapOpen(false);setHelp(false);setCameraOpen(false);}
  },[warehouseOpen]);
  useEffect(()=>{
    setMessageVisible(true);
    const timer=window.setTimeout(()=>setMessageVisible(false),4500);
    return()=>window.clearTimeout(timer);
  },[snapshot.message]);
  useEffect(()=>{
    const close=(e:KeyboardEvent)=>{
      if(e.code!=='Escape'||snapshot.paused||readerOpen||warehouseOpen||snapshot.placement||snapshot.woodcraft.dropping)return;
      if(!mapOpen&&!help&&!cameraOpen&&!snapshot.selected)return;
      e.preventDefault();e.stopPropagation();
      if(cameraOpen){setCameraOpen(false);cameraToggle.current?.focus();}
      else if(mapOpen)setMapOpen(false);
      else if(help)setHelp(false);
      else runtime.current?.select(null);
    };
    document.addEventListener('keydown',close,true);
    return()=>document.removeEventListener('keydown',close,true);
  },[mapOpen,help,cameraOpen,warehouseOpen,readerOpen,snapshot.paused,snapshot.selected,snapshot.placement,snapshot.woodcraft.dropping]);
  useEffect(()=>mountGameTimber(host.current!.parentElement!),[]);
  useWindowFocus(snapshot.paused||readerOpen?null:warehouseOpen?'.warehouse-dock':mapOpen?'.route-sheet':help?'.help-sheet':snapshot.selected&&!snapshot.placement&&!snapshot.woodcraft.dropping?'.target-card':null,warehouseOpen?'warehouse':mapOpen?'route':help?'help':snapshot.selected);
  const [targetPage,setTargetPage]=useState('use'),[helpPage,setHelpPage]=useState('move'),[pausePage,setPausePage]=useState('main');
  useEffect(()=>setTargetPage('use'),[snapshot.selected]);
  useEffect(()=>{runtime.current?.setMenuOpen(warehouseOpen||readerOpen||mapOpen||help||!!snapshot.selected&&!snapshot.placement&&!snapshot.woodcraft.dropping);},[warehouseOpen,readerOpen,mapOpen,help,snapshot.selected,snapshot.placement,snapshot.woodcraft.dropping,ready]);
  const selectedTree = snapshot.selected ? treeById.get(snapshot.selected) : undefined;
  const forest = snapshot.forestry;
  const treeAction = forest.selectedTree;
  const activeAction = forest.active;
  const gatherTarget = snapshot.gathering.selectedTarget;
  const gatherAction = snapshot.gathering.action;
  const selectedOwnedItem=snapshot.workshop.items.find(item=>item.instanceId===snapshot.selected);
  const bridgeBuilt=(snapshot.workshop.upgrades[CREEK_BRIDGE.id]?.level??0)>0;
  const bridgeDetails=snapshot.selected===CREEK_BRIDGE.id?{title:CREEK_BRIDGE.name,tag:bridgeBuilt?'两岸已接通':'待修建',detail:bridgeBuilt?'沿木桥可到东岸采集和伐木，原木仍需搬回营地入库。':'图纸已经收在仓库里。备好原木和枝杈，到桥头开工。'}:null;
  const selected = bridgeDetails ?? broomDetails(snapshot.selected,snapshot.broom) ?? housingDetails(snapshot.selected,snapshot.housing) ?? carryingDetails(snapshot.selected,snapshot.carrying) ?? woodcraftDetails(snapshot.selected,snapshot.woodcraft) ?? workshopDetails(snapshot.selected,snapshot.workshop) ?? gatherTarget ?? scenePropDetails(snapshot.selected,snapshot.appearance,forest.wood) ?? (
    snapshot.selected === "cabin"
      ? {
          title: "旧木屋",
          tag: (snapshot.workshop.upgrades.cabin?.level??0)>0?'已完成第一阶段修缮':'你的家园',
          detail:
            (snapshot.workshop.upgrades.cabin?.level??0)>0?'屋顶补上了两块木板，门边也多了支撑。剩下的缺口和墙面，留待后续修缮。':'屋顶缺了几块木板，门窗也需要照料。仓库里留着一张修缮图纸，可以先修好屋顶缺口与入口支撑。',
        }
      : snapshot.selected === "tent"
        ? {
            title: "山间帐篷",
            tag: "暂时的家",
            detail:
              "可更换布面、加固撑杆、拉紧绷绳，也能挂上风铃；这些都是同一顶帐篷的外部改造。帐内空间以后再建。",
          }
        : selectedTree
          ? {
              title: (treeAction?.status === "stump" ? "树桩 · " : "") + (
                selectedTree.role === "landmark"
                  ? "守林巨木"
                  : treeVisual(selectedTree).name),
              tag:
                selectedTree.role === "landmark"
                  ? "古老地标 · 永久保护"
                  : `经营林 · ${treeAction?.statusLabel ?? "成熟树"}`,
              detail:
                selectedTree.role === "landmark"
                  ? "山路旁的老朋友，树荫下留出了一块安静的空地。它会一直留在山谷。"
                  : treeAction?.status === "stump"
                    ? "树干已经倒下，脚边留着低矮的树桩。"
                    : treeAction?.status === "sapling"
                      ? "新树正在这片林地里生长，先让它慢慢长大。"
                      : selectedTree.kind === "pine"
                    ? "针叶枝冠随树形舒展，在山坡上为新家挡风。"
                    : "枝叶在春光里铺展开。沿小路走近，看看它粗壮的树干。",
            }
          : null);
  const upgradeAccess=snapshot.workshop.upgradeOptions[0]??snapshot.workshop.upgrade;
  const farFacility=snapshot.selected!==CAMP_VISITOR.id && (snapshot.interaction
    ? !snapshot.interaction.near
    : !!upgradeAccess?.stand&&!upgradeAccess.near);
  const approachFacility=()=>{
    if(snapshot.selected===WOODCRAFT.id)runtime.current?.openWoodcraft();
    else if(snapshot.interaction)runtime.current?.approachTarget(snapshot.selected!);
    else if(upgradeAccess)runtime.current?.approachUpgrade(upgradeAccess.targetId);
  };
  const stickOrigin = useRef<{ x: number; y: number; id: number } | null>(null),
    [stick, setStick] = useState({ x: 0, y: 0 });
  const stickDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = e.currentTarget.getBoundingClientRect();
    stickOrigin.current = {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
      id: e.pointerId,
    };
    stickMove(e);
  };
  const stickMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const origin = stickOrigin.current;
    if (!origin || origin.id !== e.pointerId) return;
    let x = (e.clientX - origin.x) / 34,
      y = (e.clientY - origin.y) / 34;
    const length = Math.max(1, Math.hypot(x, y));
    x /= length;
    y /= length;
    setStick({ x: x * 30, y: y * 30 });
    runtime.current?.setStick(x, y);
  };
  const stickEnd = () => {
    stickOrigin.current = null;
    setStick({ x: 0, y: 0 });
    runtime.current?.setStick(0, 0);
  };
  useEffect(()=>{
    const hidden=()=>{if(document.hidden)stickEnd();};
    window.addEventListener('blur',stickEnd);
    document.addEventListener('visibilitychange',hidden);
    return()=>{window.removeEventListener('blur',stickEnd);document.removeEventListener('visibilitychange',hidden);};
  },[]);
  useEffect(()=>{
    if(warehouseOpen||readerOpen||mapOpen||help||snapshot.selected||snapshot.paused)stickEnd();
  },[warehouseOpen,readerOpen,mapOpen,help,snapshot.selected,snapshot.paused]);
  return (
    <main data-how-ui="timber" className={`game-shell${warehouseOpen?' warehouse-is-open':''}${(warehouseOpen||readerOpen||mapOpen||help||selected)&&!snapshot.placement&&!snapshot.woodcraft.dropping?' menu-is-open':''}`} onPointerDownCapture={event=>{
      swallowedPointer.current=false;
      const target=event.target;
      if(!(target instanceof Element)||snapshot.placement||snapshot.woodcraft.dropping||itemDrag.drag)return;
      if(target instanceof HTMLCanvasElement&&!readerOpen&&!snapshot.paused){
        const item=runtime.current?.worldTransferItem(event.clientX,event.clientY);
        if(item&&item.kind!=='material'){
          itemDrag.start(event,item,()=>runtime.current?.select(item.id));
          return;
        }
      }
      const boundary=readerOpen?'.forest-reader':warehouseOpen?'.warehouse-dialog':snapshot.paused?'.pause-dialog':null;
      const clock=document.querySelector<HTMLDetailsElement>('.clock-menu[open]');
      const weather=document.querySelector<HTMLDetailsElement>('.weather-menu[open]');
      const outside=snapshot.paused?true:boundary?!target.closest(boundary):!target.closest('.target-card,.route-sheet,.help-sheet,.camera-tools,.clock-menu,.weather-controls');
      if(!outside||!(boundary||mapOpen||help||cameraOpen||selected||clock||weather))return;
      if(snapshot.paused){const box=pauseDialog.current?.getBoundingClientRect();if(box&&event.clientX>=box.left&&event.clientX<=box.right&&event.clientY>=box.top&&event.clientY<=box.bottom)return;}
      event.preventDefault();event.stopPropagation();swallowedPointer.current=true;
      if(readerOpen)setReaderOpen(false);
      else if(warehouseOpen){closeWarehouse();runtime.current?.select(null);}
      else if(snapshot.paused)runtime.current?.pause(false);
      else{setMapOpen(false);setHelp(false);setCameraOpen(false);runtime.current?.select(null);if(clock)clock.open=false;if(weather)weather.open=false;}
    }} onPointerUpCapture={event=>{if(swallowedPointer.current){event.preventDefault();event.stopPropagation();}}} onClickCapture={event=>{if(swallowedPointer.current){event.preventDefault();event.stopPropagation();swallowedPointer.current=false;}}}
    >
      <div className="scene-host" ref={host} />
      <div className="vignette" aria-hidden="true" />
      <header className="topbar">
        <section className="brand" aria-label="当前位置">
          <Leaf size={30} />
          <div className="journey-summary">
            <h1>{snapshot.zone}</h1>
            <p className="journey-meta">
              <span>{snapshot.workshop.calendar.season} · {snapshot.workshop.calendar.dayOfSeason} 日 · {formatClockTime(snapshot.workshop.calendar.hour)}</span>

            </p>
          </div>
        </section>
        <Hourglass view={snapshot.workshop} disabled={!ready||snapshot.paused||readerOpen||warehouseOpen}
          disabledReason={!ready?'山谷准备中':readerOpen?'读书时暂停，合上书后恢复':warehouseOpen?'整理物品时暂停，关闭后恢复':snapshot.paused?'游戏已暂停，回到山谷后恢复':undefined}
          onSpeed={s=>runtime.current?.setClockSpeed(s)}/>
        <WeatherControls view={snapshot.weather} disabled={!ready}
          onWeather={kind=>runtime.current?.setWeather(kind)}
          onIntensity={value=>runtime.current?.setWeatherIntensity(value)}
          onAutomatic={value=>runtime.current?.setWeatherAutomatic(value)}/>
        <EveningControls view={snapshot.dayCycle} disabled={!ready||snapshot.paused||readerOpen||warehouseOpen} working={readerOpen||warehouseOpen||!!snapshot.workshop.job}
          onContinue={()=>runtime.current?.setClockSpeed(1)} onSleep={()=>runtime.current?.sleepToDawn()} onReturnToCamp={()=>runtime.current?.returnToTent()}/>
        <button
          className="round-button pause"
          aria-label="暂停"
          onClick={() => runtime.current?.pause(true)}
        >
          <Icon name="pause" />
        </button>
      </header>
      <aside className="minimap-card" aria-label="山谷地图" hidden={mapOpen || help || warehouseOpen || readerOpen || !!selected}>
        <div className="map-heading">
          <span>山谷手记</span>
          <span className="north">N ↑</span>
        </div>
        <svg
          className="minimap"
          viewBox="0 0 180 150"
          role="img"
          aria-label="营地、巨木、木桥、两岸林地与当前位置"
        >
          <polyline
            points={mapLine(RIVER_KNOTS)}
            fill="none"
            stroke="#a9edee"
            strokeWidth="5"
          />
          <polyline
            points={mapLine(PATH)}
            fill="none"
            stroke="#fff1c9"
            strokeWidth="2.3"
            strokeDasharray="3 3"
          />
          <path
            d="m24 50 15-27 16 27m-39 4 13-23 13 23M151 57l11-21 12 21"
            fill="#f4f8ed26"
            stroke="#f4f8edb3"
            strokeWidth="1.2"
          />
          <polyline points={mapLine([CREEK_BRIDGE.west,CREEK_BRIDGE.east])} fill="none" stroke="#fff1c9" strokeWidth="2.5" strokeDasharray={bridgeBuilt?undefined:'2 3'}/>
          <circle cx={mapX(49)} cy={mapZ(38)} r="3" fill={snapshot.visited.includes('east-bank')?'#d4efbd':'#ffffff40'}/>
          <circle cx={mapX(HOME.x)} cy={mapZ(HOME.z)} r="4" fill="#ffe3b0" />
          <circle cx={mapX(GIANT.x)} cy={mapZ(GIANT.z)} r="5" fill="#d4efbd" />
          <circle cx={mapX(3)} cy={mapZ(48)} r="3.3" fill="#a9edee" />
          <circle
            cx={mapX(snapshot.x)}
            cy={mapZ(snapshot.z)}
            r="4.7"
            fill="#fffdf0"
            stroke="#314f40"
            strokeWidth="2"
          />
          <text x="60" y="75">
            营地
          </text>
          <text x="94" y="114">
            巨木
          </text>
          <text x="95" y="134">
            溪谷
          </text>
        </svg>
        <button className="map-expand" onClick={() => setMapOpen((v) => !v)}>
          展开路线 <span>↗</span>
        </button>
      </aside>
      <div className="hud-dock">
      {cameraOpen&&<div className="camera-tools" aria-label="镜头控制">
        <button
          aria-label="镜头左转"
          onClick={() => runtime.current?.camera("left")}
        >
          ↶
        </button>
        <button
          aria-label="镜头右转"
          onClick={() => runtime.current?.camera("right")}
        >
          ↷
        </button>
        <span />
        <button
          aria-label="缩小"
          onClick={() => runtime.current?.camera("out")}
        >
          −
        </button>
        <button aria-label="放大" onClick={() => runtime.current?.camera("in")}>
          ＋
        </button>
        <span />
        <button
          aria-label="复位镜头"
          onClick={() => runtime.current?.camera("reset")}
        >
          <Icon name="reset" />
        </button>
      </div>}
      <nav className="bottom-toolbar" aria-label="探索工具">
        <button
          className={mapOpen ? "active" : ""}
          aria-pressed={mapOpen}
          onClick={() => {
            closeWarehouse();setCameraOpen(false);
            runtime.current?.select(null);
            setMapOpen((v) => !v);
            setHelp(false);
          }}
        >
          <Icon name="map" />
          <span>路线</span>
        </button>
        <button aria-label={warehouseOpen?'收起物品面板':'打开仓库'} aria-pressed={warehouseOpen} onClick={()=>warehouseOpen?closeWarehouse():setWarehouseOpen(true)}><Icon name="warehouse"/><span>物品</span></button>
        <button ref={cameraToggle} aria-label="镜头" aria-expanded={cameraOpen} className={cameraOpen?'active':''} onClick={()=>{closeWarehouse();setMapOpen(false);setHelp(false);setCameraOpen(v=>!v);}}><Icon name="camera"/><span>镜头</span></button>
        <button
          className={help ? "active" : ""}
          aria-pressed={help}
          onClick={() => {
            closeWarehouse();setCameraOpen(false);
            runtime.current?.select(null);
            setHelp((v) => !v);
            setMapOpen(false);
          }}
        >
          <Icon name="help" />
          <span>操作</span>
        </button>
      </nav>
      </div>
      <Warehouse carrySummary={<CarryingSummary view={snapshot.carrying}/>} carrying={<CarryingControls woodcraft={snapshot.woodcraft} onDragStart={itemDrag.start} onWood={()=>leaveWarehouse(()=>runtime.current?.openWoodcraft())} onThrow={key=>leaveWarehouse(()=>runtime.current?.beginWoodDrop(key))} view={snapshot.carrying} warehouse={snapshot.warehouse} message={snapshot.message} onChange={intent=>runtime.current?.carry(intent)} onHome={()=>leaveWarehouse(()=>runtime.current?.approachTarget(CAMP_PROPS.logs.id))} onApproach={id=>leaveWarehouse(()=>runtime.current?.approachMaterial(id))}/>} open={warehouseOpen} view={snapshot.warehouse} woodcraft={snapshot.woodcraft} onClose={closeWarehouse}
        storageNear={snapshot.carrying.storageNear} onCollectAll={()=>runtime.current?.transferAllWood(true)} onWithdraw={(key,quantity)=>runtime.current?.carry({kind:'withdraw',key,quantity})} onApproachStore={()=>leaveWarehouse(()=>runtime.current?.approachTarget(CAMP_PROPS.logs.id))}
        onApproach={()=>leaveWarehouse(()=>runtime.current?.openWoodcraft())} onFocus={()=>runtime.current?.focusWoodcraft()}
        onThrow={key=>leaveWarehouse(()=>runtime.current?.beginWoodDrop(key))}
        onCollect={id=>runtime.current?.transferItem({kind:'loose-wood',id,name:'木料'},0,0,true)}
        onDragStart={itemDrag.start} dragging={!!itemDrag.drag} notice={itemDrag.notice|| (snapshot.woodcraft.loading?'正在准备木料堆…':messageVisible?snapshot.message:'')}
        furniture={<ItemBrowser label="营地物件" items={snapshot.workshop.items.filter(item=>/^(furniture|accessory|tool|vessel)\./.test(item.definitionId)).map(item=>({id:item.instanceId,name:findBlueprint(item.blueprintId)?.name??item.definitionId,icon:ownedIcon(item.definitionId,itemRarity(item).id),item}))} canDragItem={row=>row.item.location.kind!=='mounted'&&!!furnitureGeometry(row.item)} onItemPointerDown={(event,row)=>itemDrag.start(event,{kind:'furniture',id:row.item.instanceId,name:row.name})} renderDetail={({item,icon})=><><ItemHeading name={snapshot.housing.items.some(i=>i.instanceId===item.instanceId)?housingDetails(item.instanceId,snapshot.housing)?.title??'家具':snapshot.mealVessels.bowls.find(i=>i.instanceId===item.instanceId)?.name??(item.definitionId==='tool.branch-broom'?'枝扫帚':findBlueprint(item.blueprintId)?.name??'木作家具')} icon={icon} subtitle={`${itemRarity(item).name} · ${item.location.kind==='inventory'?'在库':item.location.kind==='world'?'已摆放':'已安装'}`}/>{snapshot.mealVessels.bowls.some(i=>i.instanceId===item.instanceId)?<p className="wood-note">火塘用餐时选择此碗</p>:<MenuAction onClick={()=>leaveWarehouse(()=>runtime.current?.select(item.instanceId))}>查看用法</MenuAction>}</>}/>}

        blueprints={<BlueprintLibrary view={snapshot.workshop} onSelect={id=>leaveWarehouse(()=>runtime.current?.select(id))}/>}
        wardrobe={<Wardrobe view={snapshot.wardrobe} onChange={intent=>runtime.current?.changeWear(intent)}/>}/>
      {itemDrag.drag&&<div className={`item-drag-ghost${itemDrag.drag.valid?' is-valid':''}`} style={{left:Math.min(window.innerWidth-230,Math.max(8,itemDrag.drag.x+16)),top:Math.max(8,Math.min(window.innerHeight-86,itemDrag.drag.y-68))}}><strong>{itemDrag.drag.item.name}</strong><span>{itemDrag.drag.reason}</span></div>}
      <WoodDropControls active={snapshot.woodcraft.dropping} onCancel={()=>runtime.current?.cancelWoodDrop()}/>
      <PlacementControls draft={snapshot.placement} onRotate={()=>runtime.current?.rotatePlacement()} onConfirm={()=>runtime.current?.confirmPlacement()} onCancel={()=>runtime.current?.cancelPlacement()}/>

      {['protected','conflict','failed'].includes(snapshot.save.state) && <aside className="save-warning" role="alert">{snapshot.save.message}</aside>}
      {!selected && !mapOpen && !help && !activeAction && !warehouseOpen && !readerOpen && messageVisible && <div className="message" role="status" aria-live="polite">
        {snapshot.message}
      </div>}
      {selected && !snapshot.placement && !readerOpen && !snapshot.woodcraft.dropping && !warehouseOpen && (
        <aside key={snapshot.selected} tabIndex={-1} role="dialog" aria-label="当前目标" className={`target-card${snapshot.selected===CAMP_VISITOR.id?' is-merchant':''}${gatherAction?.sourceId === gatherTarget?.id && gatherAction?.motionTag === 'gather.pickup' && ['approaching','performing'].includes(gatherAction.phase) ? ' target-card--pickup-active' : ''}`}>
          <div className="target-top">
            <h2 className={selectedOwnedItem?'rarity-name':undefined} data-rarity={selectedOwnedItem?itemRarity(selectedOwnedItem).id:undefined} style={selectedOwnedItem?rarityStyle(selectedOwnedItem):undefined}>{selected.title}</h2>
            <button
              aria-label="关闭目标详情"
              onClick={() => runtime.current?.select(null)}
            >
              ×
            </button>
          </div>

          {snapshot.selected!==CAMP_VISITOR.id&&<IconTabs label="目标操作" tabs={[{id:'use',name:'使用',icon:'craft'},...((!bridgeDetails&&(snapshot.workshop.upgradeOptions.length||snapshot.workshop.upgrade))?[{id:'upgrade',name:'改造',icon:'repair' as const}]:[]),{id:'info',name:'说明',icon:'read'}]} value={targetPage} onChange={setTargetPage}/>}
          {targetPage==='info'&&<TextPages text={`${selected.tag}。${selected.detail}`} size={85}/>}
          {targetPage==='use'&&<>
          {farFacility?<div className="facility-approach">
            <button className="context-button primary-action" disabled={!ready||snapshot.paused||!!snapshot.workshop.job} onClick={approachFacility}>{snapshot.moving?'正在走近…':'走近'}</button>
          </div>:<>
          {['grove-altar','grove-altar:oracle'].includes(snapshot.selected??'') && snapshot.interaction?.near&&<div className="tree-actions"><button className="context-button" onClick={()=>runtime.current?.ritual('prayer')}>合掌祈祷</button></div>}
          {selectedTree && branchHosts.has(selectedTree.id) && <button className="context-button" onClick={()=>runtime.current?.selectTreeBranches()}>查看枝杈</button>}
          <GroundCarryControls id={snapshot.selected} view={snapshot.carrying} onChange={intent=>runtime.current?.carry(intent)} onApproach={id=>runtime.current?.approachMaterial(id)}/>
          <WoodcraftControls selected={snapshot.selected} view={snapshot.woodcraft} message={snapshot.message} disabled={!ready||snapshot.paused||!!snapshot.placement}
            onOpen={()=>runtime.current?.openWoodcraft()} onWarehouse={()=>setWarehouseOpen(true)} onPrepare={()=>runtime.current?.transferAllWood()} onCollectAll={()=>runtime.current?.transferAllWood(true)} onThrow={()=>runtime.current?.beginWoodDrop()} onCollect={id=>runtime.current?.collectWood(id)} onClose={()=>runtime.current?.closeWoodcraft()}/>
          {snapshot.selected!==WORKBENCH.id&&snapshot.selected!==CAMP_VISITOR.id&&!isHousingItem(selectedOwnedItem?.definitionId??'')&&selectedOwnedItem?.definitionId!=='tool.branch-broom'&&<WorkshopControls selected={snapshot.selected} view={snapshot.workshop} access={snapshot.interaction} message={snapshot.message} disabled={!ready||snapshot.paused||!!snapshot.placement}
            onOffer={()=>runtime.current?.offer()} onCraft={id=>runtime.current?.craft(id)} onTrade={id=>runtime.current?.trade(id)} onSupply={id=>runtime.current?.tradeSupply(id)} onApproach={()=>runtime.current?.approachTarget(snapshot.selected!)} onCancel={()=>runtime.current?.cancelAction()} onPlace={id=>runtime.current?.beginPlacement(id)} onPack={id=>runtime.current?.packFurniture(id)}/>}
          <HousingControls selected={snapshot.selected===WORKBENCH.id?null:snapshot.selected} view={snapshot.housing} workshop={snapshot.workshop} disabled={!ready||snapshot.paused||!!snapshot.placement}
            onLearn={id=>runtime.current?.learnHousing(id)} onCraft={id=>runtime.current?.craft(id)} onMount={id=>runtime.current?.mountHousing(id)} onDetach={id=>runtime.current?.detachHousing(id)} onRing={id=>runtime.current?.ringHousing(id)} onPlace={id=>runtime.current?.beginPlacement(id)} onPack={id=>runtime.current?.packFurniture(id)} onApproach={id=>runtime.current?.approachTarget(id)} onRead={id=>openReader(id)}/>
          {snapshot.selected===WORKBENCH.id&&<><WeatherWorkNotice view={snapshot.weather} moisture={snapshot.workshop.job?.woodMoisture}/><CraftingMenu snapshot={snapshot} runtime={runtime.current} disabled={!ready||snapshot.paused} onUpgrade={()=>setTargetPage('upgrade')}/></>}
          <BroomControls selected={snapshot.selected===WORKBENCH.id?null:snapshot.selected} view={snapshot.broom} disabled={!ready||snapshot.paused||!!snapshot.placement} busy={!!snapshot.workshop.job} playing={snapshot.life.broomPlaying}
            onLearn={()=>runtime.current?.learnBroom()} onCraft={mark=>runtime.current?.craftBroom(mark)} onApproach={id=>runtime.current?.approachBroomPatch(id)} onSweep={(id,patchId)=>runtime.current?.sweepBroom(id,patchId)} onPlace={id=>runtime.current?.beginPlacement(id)} onPack={id=>runtime.current?.packFurniture(id)}/>
          <ItemOracleControls selected={snapshot.selected} view={snapshot.itemOracle} disabled={!ready||snapshot.paused||!!snapshot.placement} onApproach={()=>runtime.current?.approachTarget(CAMP_PROPS.altar.id)} onOffer={(id,riteId)=>runtime.current?.offerItemOracle(id,riteId)}/>
          {snapshot.selected===CAMP_VISITOR.id&&(
            snapshot.merchant.parked?(snapshot.interaction?.near?
              <MerchantShop view={snapshot.merchant} disabled={!ready||snapshot.paused||!!snapshot.placement} onCheckout={order=>runtime.current?.merchantCheckout(order)??false}/>:
              <button className="context-button" onClick={()=>runtime.current?.approachMerchant()}>走近货车</button>):
              <span className="merchant-empty">{snapshot.merchant.active?'行商正赶着小车过来':'行商暂时不在'}</span>
          )}
          {snapshot.selected===CAMP_PROPS.logs.id&&<div className="tree-actions">{snapshot.interaction?.near?<>{snapshot.carrying.items.length>0&&<button className="context-button primary-action" onClick={()=>runtime.current?.carry({kind:'store'})}>放入原木架与营地仓库</button>}<button className="context-button" onClick={()=>setWarehouseOpen(true)}>打开仓库</button><button className="context-button" onClick={()=>runtime.current?.openWoodcraft()}>前往木料堆取放</button></>:<button className="context-button" disabled={!ready||snapshot.paused} onClick={()=>runtime.current?.approachTarget(CAMP_PROPS.logs.id)}>走近原木架</button>}</div>}
          <FoodControls selected={snapshot.selected} view={snapshot.food} workshop={snapshot.workshop} access={snapshot.interaction} vessels={snapshot.mealVessels} mealPlaying={snapshot.life.mealPlaying} disabled={!ready||snapshot.paused||!!snapshot.placement}
            onApproach={()=>runtime.current?.approachTarget(snapshot.selected!)} onDry={()=>runtime.current?.dryMushrooms()} onCook={grain=>runtime.current?.cookSoup(grain)} onCookPorridge={grain=>runtime.current?.cookPorridge(grain)} onEat={id=>runtime.current?.eatSoup(id)} onEatPorridge={id=>runtime.current?.eatPorridge(id)} onBread={()=>runtime.current?.eatBread()} onUnpack={()=>runtime.current?.unpackFoodSack()} onRead={()=>openReader()}/>
          {snapshot.selected==='tent'&&<button className="context-button" onClick={()=>runtime.current?.select(WORKBENCH.id)}>查看工作台</button>}

          </>}
          {bridgeDetails&&<BridgeControls view={snapshot.workshop} disabled={!ready||snapshot.paused||!!snapshot.placement} onBuild={()=>runtime.current?.upgrade(CREEK_BRIDGE.id)} onCancel={()=>runtime.current?.cancelAction()}/>}
          {gatherTarget && <div className="tree-work">
            <div className="tree-facts"><span>{gatherTarget.status}</span><span>距你 {gatherTarget.distance.toFixed(1)}</span></div>
            {gatherTarget.status === '可以采集' && <p className="tree-cost">可得 {gatherTarget.reward}</p>}
            {gatherTarget.reason && <p className="action-reason">{gatherTarget.reason}</p>}
            {gatherAction?.sourceId === gatherTarget.id && ['approaching','performing'].includes(gatherAction.phase) && <p className="gather-progress">{gatherAction.phase === 'approaching' ? '正在走近…' : '正在采集…'}</p>}
            <div className="tree-actions">{gatherTarget.actions.map(action => <button key={action.id} className="context-button" disabled={!action.enabled} onClick={()=>runtime.current?.targetAction(action.id)}>{action.label}</button>)}</div>
          </div>}
          {treeAction && (
            <div className="tree-work">
              <div className="tree-facts">
                <span>{treeAction.statusLabel}</span>
                <span>距你 {treeAction.distance.toFixed(1)}</span>
              </div>
              {selectedTree?.role === "managed" && treeAction.status === "standing" && (
                <p className="tree-cost">耗 {treeAction.cost} 点额度 · 可得 {treeAction.yield} 份木材<span>可用 {forest.points.available} 点</span></p>
              )}
              {!treeAction.canChop && (treeAction.near||!treeAction.canApproach) && treeAction.reason && <p className="action-reason">{treeAction.reason}</p>}
              {selectedTree?.role==='managed'&&treeAction.status==='standing'&&!snapshot.food.heavyWork&&<p className="action-reason">现在先采菌拾枝；吃一顿正餐，为下次日出后的重活做准备。</p>}
                {activeAction?.treeId === treeAction.id && (
                <div className="work-progress" role="progressbar" aria-label={activeAction.phase === "chopping" ? "砍树进度" : "倒树进度"} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(activeAction.progress * 100)}>
                  <span style={{width:`${activeAction.progress*100}%`}} />
                </div>
              )}
              <div className="tree-actions">
                {treeAction.canApproach && !treeAction.near && <button className="context-button" onClick={()=>runtime.current?.approachSelected()}><Icon name="walk" />{snapshot.moving?'正在走近…':'走近'}</button>}
                {selectedTree?.role === "managed" && treeAction.status === "standing" && treeAction.near && <button className="context-button" disabled={!treeAction.canChop||!snapshot.food.heavyWork} onClick={()=>runtime.current?.chopSelected()}><Icon name="axe" />砍树</button>}
                {activeAction?.treeId === treeAction.id && activeAction.phase === "chopping" && <button className="context-button" onClick={()=>runtime.current?.cancelChop()}>停止挥斧</button>}
              </div>
            </div>
          )}
          </>}
          {targetPage==='upgrade'&&!bridgeDetails&&<section className="facility-upgrades">
          <UpgradeControls remote={farFacility} view={snapshot.workshop} hasContextActions={!!snapshot.interaction} disabled={!ready||snapshot.paused||!!snapshot.placement} mountReason={snapshot.food.cookingProgress!==null?'汤锅还在煮饭，做好这一锅后再更换配件。':''} onApproach={id=>runtime.current?.approachUpgrade(id)} onUpgrade={id=>runtime.current?.upgrade(id)} onMount={id=>runtime.current?.mountExterior(id)} onCancel={()=>runtime.current?.cancelAction()} onLearn={id=>runtime.current?.learnWorkshopPlan(id)}/>
          </section>}
          {messageVisible&&<p className="action-message" role="status" aria-live="polite">{snapshot.message}</p>}
          {diagnostic && selectedTree && (
            <span className="tree-identity">
              树位 {selectedTree.id.replace("tree-slot-", "")} · 个体 {treeAction?.individualId ?? selectedTree.individualId}
            </span>
          )}
        </aside>
      )}
      {activeAction && activeAction.treeId !== treeAction?.id && !mapOpen && !help && (
        <aside className="active-work" aria-label="当前林业动作">
          <span>{activeAction.phase === "chopping" ? `挥斧 ${activeAction.hits}/${activeAction.totalHits}` : "树干正在倒下，留出距离"}</span>
          {activeAction.phase === "chopping" && <button onClick={()=>runtime.current?.cancelChop()}>停止挥斧</button>}
        </aside>
      )}
      {mapOpen && (
        <aside className="route-sheet panel" tabIndex={-1} role="dialog" aria-label="路线">
          <div className="panel-heading">
            <div>
              <h2>路线</h2>
            </div>
            <button aria-label="收起路线" onClick={() => setMapOpen(false)}>
              ×
            </button>
          </div>
          <ItemBrowser label="路线" categories={[{id:'all',name:'全部',icon:'route'},{id:'camp',name:'营地',icon:'workbench'},{id:'view',name:'风景',icon:'camera'}]} items={[
            ...[{id:WOODCRAFT.id,name:'木料堆',icon:'log-rack' as const},{id:WORKBENCH.id,name:'工作台',icon:'workbench' as const},{id:CAMP_VISITOR.id,name:'行商',icon:'trade' as const},{id:'grove-altar',name:'祭坛',icon:'altar' as const},{id:'cabin',name:'旧木屋',icon:'repair' as const},{id:CAMP_PROPS.fire.id,name:'火塘',icon:'forest-soup' as const}].map(w=>({...w,category:'camp'})),
            ...WAYPOINTS.map(w=>({...w,icon:'route' as const,category:'view'}))]} renderDetail={item=><><ItemHeading name={item.name} icon={item.icon}/>{item.id==='east-bank'&&!bridgeBuilt&&<p className="wood-note">先修桥，再去东岸林地。</p>}<MenuAction onClick={()=>{if(item.category==='camp')runtime.current?.select(item.id);else runtime.current?.navigate(item.id);setMapOpen(false);}}>{item.category==='camp'?'查看':'前往'}</MenuAction></>}/>

        </aside>
      )}
      {help && (
        <aside className="help-sheet panel" tabIndex={-1} role="dialog" aria-label="操作说明">
          <div className="panel-heading">
            <h2>操作</h2>
            <button aria-label="关闭操作说明" onClick={() => setHelp(false)}>
              ×
            </button>
          </div>
          <IconTabs label="操作分类" value={helpPage} onChange={setHelpPage} tabs={[{id:'move',name:'探索',icon:'route'},{id:'life',name:'营地',icon:'workbench'},{id:'display',name:'显示',icon:'camera'}]}/>
          {helpPage==='move'&&<TextPages text="移动：WASD、方向键或点击地面，按住 Shift 跑动；手机用摇杆，点走／跑切换。拖动空地转镜头，滚轮或双指缩放。点选树木和设施，再选择操作；Esc 收起窗口。" size={70}/>}
          {helpPage==='life'&&<TextPages text="B 打开物品，材料带到原木架存放。工作台制作，火塘煮饭，行商买卖。吃正餐后，下次日出能做重活。傍晚可回帐篷休息。" size={70}/>}
          {helpPage==='display'&&<><label className="reduced"><input type="checkbox" checked={reduced} onChange={e=>setReduced(e.target.checked)}/>减少动态效果</label><RarityVfxControls mode={rarityVfxMode} onChange={changeRarityVfxMode} disabled={!ready} notice={displayNotice}/><WhimsyControls mode={whimsyMode} onChange={changeWhimsyMode} disabled={!ready} notice={whimsyNotice}/></>}

        </aside>
      )}
      <div
        className="joystick"
        role="group"
        aria-label="触控移动摇杆"
        onPointerDown={stickDown}
        onPointerMove={stickMove}
        onPointerUp={stickEnd}
        onPointerCancel={stickEnd}
        onLostPointerCapture={stickEnd}
      >
        <span className="stick-guides">＋</span>
        <span
          className="stick"
          style={{ transform: `translate(${stick.x}px,${stick.y}px)` }}
        />
      </div>
      <button
        type="button"
        className="run-toggle"
        aria-label={snapshot.running?'切换为走路':'切换为跑动'}
        aria-pressed={snapshot.running}
        disabled={!ready||snapshot.paused||!!snapshot.placement||snapshot.woodcraft.dropping}
        onClick={()=>runtime.current?.setRunning(!snapshot.running)}
      >
        <Icon name="walk" />
        <span>{snapshot.running?'跑':'走'}</span>
      </button>
      <dialog
        className="pause-dialog"
        ref={pauseDialog}
        onCancel={(e) => {
          e.preventDefault();
          runtime.current?.pause(false);
        }}
      >
        <IconTabs label="暂停选项" value={pausePage} onChange={setPausePage} tabs={[{id:"main",name:"休息",icon:"rest"},{id:"display",name:"显示",icon:"camera"},{id:"save",name:"存档",icon:"blueprint"}]}/>
        {pausePage==='main'&&<>
        <h2>山谷会等你</h2>

        <button
          className="primary-button"
          autoFocus
          onClick={() => runtime.current?.pause(false)}
        >
          回到山谷
        </button>
        <button
          className="text-button"
          onClick={() => {
            runtime.current?.camera("reset");
            runtime.current?.pause(false);
          }}
        >
          复位镜头并继续
        </button>
        </>}
        {pausePage==='display'&&<>
        <RarityVfxControls mode={rarityVfxMode} onChange={changeRarityVfxMode} disabled={!ready} notice={displayNotice}/>
        <WhimsyControls mode={whimsyMode} onChange={changeWhimsyMode} disabled={!ready} notice={whimsyNotice}/>
        </>}
        {pausePage==='save'&&<SaveControls status={snapshot.save}
          onSave={() => runtime.current?.saveWorld() ?? Promise.resolve(false)}
          onReload={() => runtime.current?.reloadWorld() ?? Promise.resolve(false)}
          onRestore={() => runtime.current?.restoreWorldCopy() ?? Promise.resolve(false)}
          onExport={which => runtime.current?.exportWorldRecord(which) ?? Promise.resolve(null)}/>}
      </dialog>
      {!ready && !error && (
        <div className="loading">
          <Leaf size={40} />
          <h2>山谷正在醒来</h2>
          <p>铺好小路，等你回家。</p>
        </div>
      )}
      {error && (
        <div className="loading">
          <h2>山谷暂时没能打开</h2>
          <p>{error}</p>
          <button
            className="primary-button"
            onClick={() => setMountVersion((v) => v + 1)}
          >
            重新进入
          </button>
        </div>
      )}
      {diagnostic && (
        <details className="diagnostics">
          <summary>运行检查</summary>
          <button id="toggle-ambient-occlusion" aria-pressed={(snapshot.stats.occlusion as {enabled?:boolean}|undefined)?.enabled??true} onClick={()=>runtime.current?.setAmbientOcclusion(!((snapshot.stats.occlusion as {enabled?:boolean}|undefined)?.enabled??true))}>局部遮蔽 / 林间衰减：{(snapshot.stats.occlusion as {enabled?:boolean}|undefined)?.enabled===false?'关':'开'}</button>
          <SceneInspector key={mountVersion} runtime={()=>runtime.current} active={typeof snapshot.stats.scenePreset==='string'} audits={audit}/>
          <WardrobeLab key={'wardrobe-'+mountVersion} runtime={()=>runtime.current}/>
          <button
            disabled={capturing}
            onClick={() => {
              const previous=runtime.current;
              previous?.destroy();
              if(previous)setAudit(a=>[...a,previous.stats()]);
              setMountVersion((v) => v + 1);
            }}
          >
            卸载并重入
          </button>
          <button
            title="选择离当前位置最近的成熟经营树"
            onClick={() => {
              const current=runtime.current;
              if(!current)return;
              const slots=current.getState().forestry.slots;
              const nearest=trees
                .filter(t=>t.role==='managed'&&slots[t.id]?.status==='standing')
                .sort((a,b)=>Math.hypot(a.x-snapshot.x,a.z-snapshot.z)-Math.hypot(b.x-snapshot.x,b.z-snapshot.z))[0];
              current.select(nearest?.id??null);
            }}
          >
            选择经营树
          </button>
          <button onClick={() => runtime.current?.select("landmark-elder")}>
            选择巨木
          </button>
          <button onClick={() => runtime.current?.select("cabin")}>
            选择木屋
          </button>
          <button onClick={() => runtime.current?.select(WORKBENCH.id)}>选择工作台</button><button onClick={() => runtime.current?.select(CAMP_VISITOR.id)}>选择行商</button>
          <button onClick={() => runtime.current?.select('grove-altar')}>选择祭坛</button>
          {import.meta.env.DEV&&<button onClick={()=>runtime.current?.stepReviewSimulation(10)} disabled={!ready||snapshot.paused||warehouseOpen||readerOpen}>推进 10 秒正常模拟</button>}
          <button onClick={() => runtime.current?.selectGathering('branch')}>选择树上枝杈</button><button onClick={()=>runtime.current?.selectGathering('scrap')}>选择地面碎柴</button>
          <button onClick={() => runtime.current?.selectGathering('mushroom')}>选择蘑菇簇</button>
          <label>动作停帧秒数 <input aria-label="动作停帧秒数" type="number" min="0" step="0.05" defaultValue="1.15" onChange={e=>runtime.current?.captureActionAt(Number(e.target.value))}/></label>
          <button onClick={()=>runtime.current?.captureActionAt(1.15)}>下一动作接触停帧</button>
          <button onClick={()=>runtime.current?.inspectCharacter('horizontal')}>检视横砍止点</button>
          <button onClick={()=>runtime.current?.inspectCharacter('vertical')}>检视竖劈止点</button>
          <button onClick={()=>runtime.current?.inspectCharacter(null)}>结束动作检视</button>
          <button onClick={()=>startRecording('walkthrough')} disabled={capturing}>
            {capturing && recordMode.current==='walkthrough' ? "录制漫步中…" : "录制20秒漫步"}
          </button>
          <button onClick={()=>startRecording('forestry')} disabled={capturing}>
            {capturing && recordMode.current==='forestry' ? "录制采伐中…" : "录制20秒采伐"}
          </button>
          <button onClick={()=>startRecording('gathering')} disabled={capturing}>{capturing && recordMode.current==='gathering' ? '录制采集中…' : '录制20秒采集'}</button>
          {recordUrl && (
            <>
            <video
              src={recordUrl}
              controls
              width="300"
              aria-label={recordMode.current==='forestry' ? '山谷采伐录像' : '山谷漫步录像'}
            />
            {import.meta.env.DEV && <button onClick={saveRecording} disabled={capturing}>保存录像到沙盒</button>}
            {recordSaved && <p role="status">{recordSaved}</p>}
            </>
          )}
          <pre
            id="runtime-stats"
            data-audit-ready={Number(snapshot.stats.samples) > 90}
            data-runtime-version={snapshotVersion}
          >
            {JSON.stringify({ current: snapshot.stats, audit }, null, 2)}
          </pre>
        </details>
      )}
      {readerOpen && <ForestReader day={snapshot.dayCycle.day} seed={WORLD_SEED} onClose={()=>setReaderOpen(false)}/>}
      {dawnFlash>0 && <div className="sunrise-transition" key={dawnFlash} aria-live="polite"><span>晨光照进森林，新的一天开始了</span></div>}
      {diagnostic && <div className="build-mark">M0 · 山谷初见</div>}
    </main>
  );
}
