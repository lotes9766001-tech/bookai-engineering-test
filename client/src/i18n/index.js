import { zhTW } from './zh-TW';
import { enUS } from './en-US';
export const dicts = { 'zh-TW': zhTW, 'en-US': enUS };
export const t = (key) => (dicts['zh-TW'][key] || key);
