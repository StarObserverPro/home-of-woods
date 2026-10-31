import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { createRuntime } from "../app/runtime.ts";
import type { Runtime, Snapshot } from "../app/runtime.ts";
import type { GameState } from "../domain/state.ts";
import { WAYPOINTS, PATH, RIVER_KNOTS, GIANT, HOME, START } from "../content/world.ts";
import { makeTrees } from "../world/layout.ts";
import { recordCanvas } from "../app/recorder.ts";
import { Warehouse } from './Warehouse.tsx';
import { SaveControls } from './SaveControls.tsx';
import { createSaveController, INITIAL_SAVE_STATUS } from '../app/save-controller.ts';
import type { SaveController } from '../app/save-controller.ts';
import { createBrowserWorldSaveStore } from '../app/world-save-store.ts';
import { createSaveContext } from '../domain/save-context.ts';
import {sceneAppearanceAt,scenePropDetails} from '../domain/scene-props.ts';
import {SceneInspector} from './SceneInspector.tsx';

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
function Icon({ name }: { name: string }) {
  const common = {
    width: 22,
    height: 22,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  return (
    <svg {...common} aria-hidden="true">
      {name === "pause" ? (
        <>
          <path d="M9 5v14M15 5v14" />
        </>
      ) : name === "home" ? (
        <>
          <path d="m3 11 9-8 9 8M5 10v10h14V10M10 20v-7h4v7" />
        </>
      ) : name === "map" ? (
        <>
          <path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2V5ZM9 3v16M15 5v16" />
        </>
      ) : name === "walk" ? (
        <>
          <circle cx="13" cy="4" r="2" />
          <path d="m10 9 3-2 3 5 3 1M13 8l-2 7-4 6M11 15l5 6M9 10l-4 3" />
        </>
      ) : name === "help" ? (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M9.5 9a2.5 2.5 0 1 1 4 2l-1.5 1v2M12 17v.1" />
        </>
      ) : name === "reset" ? (
        <>
          <path d="M4 8a8 8 0 1 1 0 8M4 3v5h5" />
        </>
      ) : name === 'warehouse' ? (<><path d="M4 7h16v14H4ZM3 7l9-5 9 5M8 11h8v10M8 15h8" /></>) : name === "axe" ? (
        <>
          <path d="m7 21 9-16M12 4l6 4-2 5-7-4Z" />
        </>
      ) : (
        <path d="m15 6-6 6 6 6" />
      )}
    </svg>
  );
}
const trees = makeTrees();
const treeById = new Map(trees.map(tree=>[tree.id,tree]));
const mapX=(x:number)=>(x+90)*.9;
const mapZ=(z:number)=>(z+85)*.9;
const mapLine=(p:{x:number;z:number}[])=>p.map(v=>`${mapX(v.x)},${mapZ(v.z)}`).join(' ');
const empty: Snapshot = {
  zone: "山间营地",
  x: START.x,
  z: START.z,
  height: 21.5,
  selected: null,
  moving: false,
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
  save: INITIAL_SAVE_STATUS,
  appearance:sceneAppearanceAt(0),
};
export function App() {
  const host = useRef<HTMLDivElement>(null),
    runtime = useRef<Runtime | null>(null),
    sessionState = useRef<GameState | null>(null),
    saveOwner = useRef<SaveController | null>(null),
    pauseDialog = useRef<HTMLDialogElement>(null);
  const [snapshot, setSnapshot] = useState(empty),
    [ready, setReady] = useState(false),
    [error, setError] = useState(""),
    [mapOpen, setMapOpen] = useState(false),
    [help, setHelp] = useState(false),
    [warehouseOpen, setWarehouseOpen] = useState(false),
    [reduced, setReduced] = useState(false),
    [mountVersion, setMountVersion] = useState(0),
    [audit, setAudit] = useState<Record<string, unknown>[]>([]);
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
    saveOwner.current ??= createSaveController(createBrowserWorldSaveStore(), createSaveContext());
    createRuntime(host.current!, (value) => {
      if (!cancelled) {
        setSnapshot(value);
        setSnapshotVersion(mountVersion);
        if (value.selected) {
          setMapOpen(false);
          setHelp(false);
        }
      }
    }, sessionState.current ?? undefined, saveOwner.current)
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
  useEffect(() => { runtime.current?.setInterfaceOpen(warehouseOpen); },[warehouseOpen,ready]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if(e.code!=='KeyB'||e.repeat||e.target instanceof HTMLElement && e.target.closest('input,textarea,select,[contenteditable]'))return;
      if(!ready||snapshot.paused)return;
      e.preventDefault();e.stopPropagation();setWarehouseOpen(v=>!v);
    };
    document.addEventListener('keydown',key,true);return()=>document.removeEventListener('keydown',key,true);
  },[ready,snapshot.paused]);
  const selectedTree = snapshot.selected ? treeById.get(snapshot.selected) : undefined;
  const forest = snapshot.forestry;
  const treeAction = forest.selectedTree;
  const activeAction = forest.active;
  const gatherTarget = snapshot.gathering.selectedTarget;
  const gatherAction = snapshot.gathering.action;
  const selected = gatherTarget ?? scenePropDetails(snapshot.selected,snapshot.appearance,forest.wood) ?? (
    snapshot.selected === "cabin"
      ? {
          title: "旧木屋",
          tag: "你的家园",
          detail:
            "屋顶缺了几块木板，门窗也需要照料。先在帐篷里安顿下来，再把它慢慢修好。",
        }
      : snapshot.selected === "tent"
        ? {
            title: "山间帐篷",
            tag: "暂时的家",
            detail:
              "米白色帆布下，是一张暖和的毯子。推开帐门，整座山谷就在眼前。",
          }
        : selectedTree
          ? {
              title: (treeAction?.status === "stump" ? "树桩 · " : "") + (
                selectedTree.role === "landmark"
                  ? "守林巨木"
                  : selectedTree.kind === "pine"
                    ? "青松"
                    : "山地栎树"),
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
                    ? "一层层圆润的针叶树冠，在山坡上为新家挡风。"
                    : "枝叶在春光里铺展开。沿小路走近，看看它粗壮的树干。",
            }
          : null);
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
  return (
    <main className="game-shell">
      <div className="scene-host" ref={host} />
      <div className="vignette" aria-hidden="true" />
      <header className="topbar">
        <section className="brand" aria-label="当前位置">
          <Leaf size={30} />
          <div className="journey-summary">
            <span className="brand-name">森林之家</span>
            <h1>{snapshot.zone}</h1>
            <p className="journey-meta">
              <span>{snapshot.appearance.hour>=19||snapshot.appearance.hour<6?'春夜':snapshot.appearance.hour>=17?'春暮':'春日'} · 晴</span>
              <span>风景 {snapshot.visited.length}/4</span>
              <span>原木 {forest.wood}</span>
              {snapshot.gathering.inventory.map(item => <span key={item.typeId}>{item.name} {item.quantity}</span>)}
            </p>
          </div>
        </section>
        <button
          className="round-button pause"
          aria-label="暂停"
          onClick={() => runtime.current?.pause(true)}
        >
          <Icon name="pause" />
        </button>
      </header>
      <aside className="minimap-card" aria-label="山谷地图" hidden={mapOpen || help || !!selected}>
        <div className="map-heading">
          <span>山谷手记</span>
          <span className="north">N ↑</span>
        </div>
        <svg
          className="minimap"
          viewBox="0 0 180 150"
          role="img"
          aria-label="营地、巨木、溪谷路线与当前位置"
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
      <div className="camera-tools" aria-label="镜头控制">
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
      </div>
      <span className="dock-divider" aria-hidden="true" />
      <nav className="bottom-toolbar" aria-label="探索工具">
        <button
          className={!mapOpen && !help ? "active" : ""}
          aria-pressed={!mapOpen && !help}
          onClick={() => {
            setMapOpen(false);
            setHelp(false);
            runtime.current?.select(null);
          }}
        >
          <Icon name="walk" />
          <span>漫步</span>
        </button>
        <button
          className={mapOpen ? "active" : ""}
          aria-pressed={mapOpen}
          onClick={() => {
            runtime.current?.select(null);
            setMapOpen((v) => !v);
            setHelp(false);
          }}
        >
          <Icon name="map" />
          <span>路线</span>
        </button>
        <button aria-label="打开仓库" aria-pressed={warehouseOpen} onClick={()=>setWarehouseOpen(true)}><Icon name="warehouse"/><span>仓库</span></button>
        <button
          className={help ? "active" : ""}
          aria-pressed={help}
          onClick={() => {
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
      <Warehouse open={warehouseOpen} view={snapshot.warehouse} onClose={()=>setWarehouseOpen(false)}/>
      <button className="save-indicator" aria-label="查看世界存档" title={snapshot.save.message} onClick={() => runtime.current?.pause(true)}>
        <span className="save-label">存档 · </span>{({loading:'读取中',ready:'待保存',saving:'保存中',saved:'已保存',protected:'受保护',conflict:'需重读',failed:'未保存'} as const)[snapshot.save.state]}
      </button>
      {['protected','conflict','failed'].includes(snapshot.save.state) && <aside className="save-warning" role="alert">{snapshot.save.message}</aside>}
      <div className="input-hint">
        <kbd>W A S D</kbd> 移动 <i /> 点地面前往 <i /> 拖动转镜头 · 滚轮缩放
      </div>
      {!selected && !mapOpen && !help && !activeAction && <div className="message" role="status" aria-live="polite">
        {snapshot.message}
      </div>}
      {selected && (
        <aside className="target-card">
          <div className="target-top">
            <span className="eyebrow">{selected.tag}</span>
            <button
              aria-label="关闭目标详情"
              onClick={() => runtime.current?.select(null)}
            >
              ×
            </button>
          </div>
          <h2>{selected.title}</h2>
          {['grove-altar','grove-altar:oracle'].includes(snapshot.selected??'') && <div className="tree-actions"><button className="context-button" onClick={()=>runtime.current?.ritual('prayer')}>合掌祈祷</button><button className="context-button" disabled title="供品与回应规则待配置">祭祀待开放</button><button className="context-button" onClick={()=>runtime.current?.cancelAction()}>取消动作</button></div>}
          {selectedTree && ['tree-slot-r3-hero-0','tree-slot-16-9','tree-slot-13-6','tree-slot-17-11','landmark-elder'].includes(selectedTree.id) && <button className="context-button" onClick={()=>runtime.current?.selectTreeBranches()}>上树采枝</button>}
          <p>{selected.detail}</p>
          {gatherTarget && <div className="tree-work">
            <div className="tree-facts"><span>{gatherTarget.status}</span><span>距你 {gatherTarget.distance.toFixed(1)}</span></div>
            {gatherTarget.status === '可以采集' && <p className="tree-cost">可得 {gatherTarget.reward}</p>}
            {gatherTarget.reason && <p className="action-reason">{gatherTarget.reason}</p>}
            <p className="action-message" role="status" aria-live="polite">{snapshot.message}</p>
            {gatherAction?.sourceId === gatherTarget.id && ['approaching','performing'].includes(gatherAction.phase) && <p>{gatherAction.phase === 'approaching' ? '正在走近…' : '正在采集…'}</p>}
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
              {!treeAction.canChop && treeAction.reason && <p className="action-reason">{treeAction.reason}</p>}
              <p className="action-message" role="status" aria-live="polite">{snapshot.message}</p>
              {activeAction?.treeId === treeAction.id && (
                <div className="work-progress" role="progressbar" aria-label={activeAction.phase === "chopping" ? "砍树进度" : "倒树进度"} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(activeAction.progress * 100)}>
                  <span style={{width:`${activeAction.progress*100}%`}} />
                </div>
              )}
              <div className="tree-actions">
                {treeAction.canApproach && <button className="context-button" onClick={()=>runtime.current?.approachSelected()}><Icon name="walk" />{treeAction.canChop?'调整站位':'走近'}</button>}
                {selectedTree?.role === "managed" && treeAction.status === "standing" && <button className="context-button" disabled={!treeAction.canChop} onClick={()=>runtime.current?.chopSelected()}><Icon name="axe" />砍树</button>}
                {activeAction?.treeId === treeAction.id && activeAction.phase === "chopping" && <button className="context-button" onClick={()=>runtime.current?.cancelChop()}>停止挥斧</button>}
              </div>
            </div>
          )}
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
        <aside className="route-sheet panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">TAKE THE SCENIC ROUTE</span>
              <h2>去山谷走走</h2>
            </div>
            <button aria-label="收起路线" onClick={() => setMapOpen(false)}>
              ×
            </button>
          </div>
          <p>选一处风景，沿途慢慢走。方向键可以随时接过移动。</p>
          {WAYPOINTS.map((wp, i) => (
            <button
              className="route-stop"
              key={wp.id}
              onClick={() => {
                runtime.current?.navigate(wp.id);
                setMapOpen(false);
              }}
            >
              <span className="stop-number">
                {snapshot.visited.includes(wp.id) ? "✓" : `0${i + 1}`}
              </span>
              <span>
                <strong>{wp.name}</strong>
                <small>{wp.note}</small>
              </span>
              <span className="route-arrow">↗</span>
            </button>
          ))}
        </aside>
      )}
      {help && (
        <aside className="help-sheet panel">
          <div className="panel-heading">
            <h2>在山谷里，自在一点</h2>
            <button aria-label="关闭操作说明" onClick={() => setHelp(false)}>
              ×
            </button>
          </div>
          <p>
            <b>移动</b>　WASD / 方向键，或点击地面。手机用左下摇杆。
          </p>
          <p>
            <b>看风景</b>　拖动空地转动镜头；滚轮 / 双指缩放。底部按钮可复位。
          </p>
          <p>
            <b>认识目标</b>　点击树、帐篷或木屋查看详情。
          </p>
          <p><b>砍树</b>　选中经营树、走近后挥斧。巨木始终受到保护。</p>
          <p><b>采集</b>　点选落枝堆或蘑菇簇，再按“采集 / 走近采集”或 E。移动或切换目标可取消。</p>
          <p><b>仓库</b>　底部“仓库”或 B 查看分类物品与加工方向；Esc 收起后继续巡林。</p>
          <p>
            <b>歇一会</b>　Esc 或右上角暂停。离开页面时，山谷也会等你。
          </p>
          <label className="reduced">
            <input
              type="checkbox"
              checked={reduced}
              onChange={(e) => setReduced(e.target.checked)}
            />
            减少动态效果
          </label>
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
      <dialog
        className="pause-dialog"
        ref={pauseDialog}
        onCancel={(e) => {
          e.preventDefault();
          runtime.current?.pause(false);
        }}
      >
        <Leaf size={39} />
        <span className="eyebrow">A LITTLE BREATHING ROOM</span>
        <h2>山谷会等你</h2>
        <p>歇一会儿，再继续散步。</p>
        <SaveControls status={snapshot.save}
          onSave={() => runtime.current?.saveWorld() ?? Promise.resolve(false)}
          onReload={() => runtime.current?.reloadWorld() ?? Promise.resolve(false)}
          onRestore={() => runtime.current?.restoreWorldCopy() ?? Promise.resolve(false)}
          onExport={which => runtime.current?.exportWorldRecord(which) ?? Promise.resolve(null)}/>
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
          <SceneInspector key={mountVersion} runtime={()=>runtime.current} active={typeof snapshot.stats.scenePreset==='string'} audits={audit}/>
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
          <button onClick={() => runtime.current?.select('grove-altar')}>选择祭坛</button>
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
      {diagnostic && <div className="build-mark">M0 · 山谷初见</div>}
    </main>
  );
}
