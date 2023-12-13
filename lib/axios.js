'use strict';

import utils from './utils.js';
import bind from './helpers/bind.js';
import Axios from './core/Axios.js';
import mergeConfig from './core/mergeConfig.js';
import defaults from './defaults/index.js';
import formDataToJSON from './helpers/formDataToJSON.js';
import CanceledError from './cancel/CanceledError.js';
import CancelToken from './cancel/CancelToken.js';
import isCancel from './cancel/isCancel.js';
import {VERSION} from './env/data.js';
import toFormData from './helpers/toFormData.js';
import AxiosError from './core/AxiosError.js';
import spread from './helpers/spread.js';
import isAxiosError from './helpers/isAxiosError.js';
import AxiosHeaders from "./core/AxiosHeaders.js";
import adapters from './adapters/adapters.js';
import HttpStatusCode from './helpers/HttpStatusCode.js';

/**
 * Create an instance of Axios
 * 创建一个 Axios 实例，并对该实例进行一些属性和方法的扩展，以实现原型继承、属性继承和工厂模式。
 * 返回的 instance 对象是经过扩展后的具有请求能力的实例。
 * 优点:
 * -- 可以直接使用 instance.method() 等方法发起请求。(Axios原型上的能力)
 * -- 可以直接使用 instance.interceptors.use() 等方法添加拦截器。(Axios原型上的能力)
 * -- 可以直接使用 instance.defaults.xxx = 'xxx' 等方法修改默认配置。(Axios原型上的能力)
 * -- 可以通过 create 方法创建新实例，并通过实例的 method() 等方法发起请求。(Axios类上的能力)
 *
 * 直接返回 new Axios(defaultConfig) 无法实现这些扩展和继承的功能。
 */
function createInstance(defaultConfig) {
  // 存在的意义:用于绑定执行上下文，确保请求方法的执行上下文为 context 对象。
  const context = new Axios(defaultConfig);
  // 真正要用的
  const instance = bind(Axios.prototype.request, context);

  // 将 Axios 类的原型方法和属性继承到 instance 对象上，使其具备与 Axios 类相同的能力。
  // 其中也包括了 constructor 属性。
  utils.extend(instance, Axios.prototype, context, {allOwnKeys: true});
  // 将 context 对象的属性（包括原型链上的属性）拷贝到 instance 对象上。
  // 这样做的目的是将 context 对象的属性（例如拦截器、超时等）继承到 instance 对象上，以便在使用 instance 发起请求时能够访问这些属性。
  utils.extend(instance, context, null, {allOwnKeys: true});

  // 工厂模式: 用于创建新实例的 每次 axios.create 都是此处
  // 每次调用 axios.create 都会通过 createInstance 函数来创建新的实例，并将默认配置和传入的实例配置进行合并。
  // 这样可以方便地创建具有不同配置的 Axios 实例，实现了工厂模式。
  instance.create = function create(instanceConfig) {
    // 将业务中 instanceConfig 合并到默认配置, instanceConfig 包括拦截器和超时等
    return createInstance(mergeConfig(defaultConfig, instanceConfig));
  };

  return instance;
}

// Create the default instance to be exported
const axios = createInstance(defaults);

// Expose Axios class to allow class inheritance
axios.Axios = Axios;

// Expose Cancel & CancelToken
axios.CanceledError = CanceledError;
axios.CancelToken = CancelToken;
axios.isCancel = isCancel;
axios.VERSION = VERSION;
axios.toFormData = toFormData;

// Expose AxiosError class
axios.AxiosError = AxiosError;

// alias for CanceledError for backward compatibility
axios.Cancel = axios.CanceledError;

// Expose all/spread
axios.all = function all(promises) {
  return Promise.all(promises);
};

axios.spread = spread;

// Expose isAxiosError
axios.isAxiosError = isAxiosError;

// Expose mergeConfig
axios.mergeConfig = mergeConfig;

axios.AxiosHeaders = AxiosHeaders;

axios.formToJSON = thing => formDataToJSON(utils.isHTMLForm(thing) ? new FormData(thing) : thing);

axios.getAdapter = adapters.getAdapter;

axios.HttpStatusCode = HttpStatusCode;

axios.default = axios;

// this module should only have a default export
export default axios
