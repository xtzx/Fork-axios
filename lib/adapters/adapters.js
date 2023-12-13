import utils from '../utils.js';
import httpAdapter from './http.js';
import xhrAdapter from './xhr.js';
import AxiosError from "../core/AxiosError.js";

const knownAdapters = {
  http: httpAdapter, // 浏览器环境下此字段是 null
  xhr: xhrAdapter
}

// 功能就是给 knownAdapters 添加 name 和 adapterName 属性
utils.forEach(knownAdapters, (fn, value) => {
  // fn 是配置中的 xhrAdapter 函数
  // value 是 "xhr" 和 "http"
  if (fn) {
    try {
      // 给 knownAdapters 下每一项定义一个名为 name 的只读属性，属性值为传入的 value
      Object.defineProperty(fn, 'name', {value});
    } catch (e) {
      // eslint-disable-next-line no-empty
    }
    Object.defineProperty(fn, 'adapterName', {value});
  }
});

const renderReason = (reason) => `- ${reason}`;

const isResolvedHandle = (adapter) => utils.isFunction(adapter) || adapter === null || adapter === false;

export default {
  getAdapter: (adapters) => {
    adapters = utils.isArray(adapters) ? adapters : [adapters];

    const {length} = adapters;
    let nameOrAdapter;
    let adapter;

    const rejectedReasons = {};

    for (let i = 0; i < length; i++) {
      nameOrAdapter = adapters[i];
      let id;

      adapter = nameOrAdapter;

      // 因为 adapters 支持自定义,所以有这个配置项
      if (!isResolvedHandle(nameOrAdapter)) {
        adapter = knownAdapters[(id = String(nameOrAdapter)).toLowerCase()];

        if (adapter === undefined) {
          throw new AxiosError(`Unknown adapter '${id}'`);
        }
      }

      // 如果传入了自定义适配器就跳出循环
      if (adapter) {
        break;
      }

      rejectedReasons[id || '#' + i] = adapter;
    }

    if (!adapter) {

      const reasons = Object.entries(rejectedReasons)
        .map(([id, state]) => `adapter ${id} ` +
          (state === false ? 'is not supported by the environment' : 'is not available in the build')
        );

      let s = length ?
        (reasons.length > 1 ? 'since :\n' + reasons.map(renderReason).join('\n') : ' ' + renderReason(reasons[0])) :
        'as no adapter specified';

      throw new AxiosError(
        `There is no suitable adapter to dispatch the request ` + s,
        'ERR_NOT_SUPPORT'
      );
    }

    return adapter;
  },
  adapters: knownAdapters
}
