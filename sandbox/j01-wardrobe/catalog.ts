export const styles = {
  yard: '林场工装',
  town: '镇上便服',
  trail: '林地巡游',
} as const;

export type Style = keyof typeof styles;
export const styleIds = Object.keys(styles) as Style[];

export const slots = {
  top: '上衣', legs: '裤装', feet: '鞋靴', head: '帽子',
  back: '背负', hands: '手套', waist: '腰带', neck: '领巾',
} as const;

export type Slot = keyof typeof slots;
export const slotIds = Object.keys(slots) as Slot[];
export const optionalSlots: readonly Slot[] = ['head', 'back', 'hands', 'waist', 'neck'];

interface Pattern {
  name: string;
  upgrade: string;
  attachment: string;
}

export const patterns: Record<Slot, Record<Style, Pattern>> = {
  top: {
    yard: {name: '立领工衫', upgrade: '双胸袋与后肩车线', attachment: '工坊铜章'},
    town: {name: '粗呢双尖背心', upgrade: '滚边与嵌线袋', attachment: '怀表链'},
    trail: {name: '束腰巡游外套', upgrade: '门襟加固与明线褶', attachment: '铜蕨胸针'},
  },
  legs: {
    yard: {name: '直筒工裤', upgrade: '补强膝片', attachment: '腰袋挂扣'},
    town: {name: '及膝裤与长袜', upgrade: '裤缝镶线与筒口扣', attachment: '腰袋挂扣'},
    trail: {name: '收口巡游裤', upgrade: '圆角护膝片', attachment: '腰袋挂扣'},
  },
  feet: {
    yard: {name: '圆头短工靴', upgrade: '缝沿与护趾', attachment: '铜鞋扣'},
    town: {name: '窄楦系带鞋', upgrade: '缝沿与包头', attachment: '铜鞋扣'},
    trail: {name: '长筒绑带靴', upgrade: '缝沿与护趾', attachment: '铜鞋扣'},
  },
  head: {
    yard: {name: '八片短檐帽', upgrade: '八片分缝', attachment: '帽徽'},
    town: {name: '偏冠软呢贝雷', upgrade: '织带帽围', attachment: '帽徽'},
    trail: {name: '软毡巡林帽', upgrade: '双线帽边', attachment: '铜帽针'},
  },
  back: {
    yard: {name: '双肩帆布包', upgrade: '双缘缝线', attachment: '皮质小水壶'},
    town: {name: '斜挎皮书袋', upgrade: '袋面双缘缝线', attachment: '卷图筒'},
    trail: {name: '毯卷行囊', upgrade: '双缘缝线', attachment: '侧挂皮水壶'},
  },
  hands: {
    yard: {name: '露指帆布手套', upgrade: '护腕镶线', attachment: '腕扣'},
    town: {name: '羊皮便装手套', upgrade: '皮边压线', attachment: '袖扣'},
    trail: {name: '蜡皮护腕手套', upgrade: '双线护边', attachment: '腕扣'},
  },
  waist: {
    yard: {name: '方扣工装皮带', upgrade: '双边车线', attachment: '挂钥圈'},
    town: {name: '窄身便服腰带', upgrade: '双边车线', attachment: '挂钥圈'},
    trail: {name: '巡游织带', upgrade: '加固包边', attachment: '挂钥圈'},
  },
  neck: {
    yard: {name: '三角工领巾', upgrade: '反折包边', attachment: '领巾铜扣'},
    town: {name: '短领结', upgrade: '折叠领缘', attachment: '圆领针'},
    trail: {name: '斜折巡游巾', upgrade: '压线短尾', attachment: '领巾铜扣'},
  },
};

export const dyes = {
  original: { name: '原色', hex: '' },
  flax: { name: '亚麻', hex: '#b7a080' },
  pine: { name: '松针', hex: '#56684e' },
  ink: { name: '靛蓝', hex: '#455978' },
  rust: { name: '铁锈', hex: '#98624f' },
  ash: { name: '石灰', hex: '#6e7475' },
} as const;

export type Dye = keyof typeof dyes;
export const dyeIds = Object.keys(dyes) as Dye[];
export interface Choice {
  style: Style | 'none';
  dye: Dye;
  upgraded: boolean;
  attached: boolean;
}
export type Outfit = Record<Slot, Choice>;

export function chooseOutfit(style: Style): Outfit {
  return Object.fromEntries(slotIds.map(slot => [slot, {
    style, dye: 'original', upgraded: false, attached: false,
  } satisfies Choice])) as Outfit;
}

export const cameras = { front: '正面', quarter: '斜侧', side: '侧面', back: '背面' } as const;
export const poses = { stand: '站立', walk: '步行', run: '跑步', reach: '抬臂', squat: '屈膝' } as const;
export type CameraAngle = keyof typeof cameras;
export type Pose = keyof typeof poses;
