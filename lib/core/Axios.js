'use strict';

// Axios 实例创建
// 主要就是请求/响应拦截器部分功能
// TODO: runWhen 请求拦截器异步写法

import utils from './../utils.js';
import buildURL from '../helpers/buildURL.js';
import InterceptorManager from './InterceptorManager.js';
import dispatchRequest from './dispatchRequest.js';
import mergeConfig from './mergeConfig.js';
import buildFullPath from './buildFullPath.js';
import validator from '../helpers/validator.js';
import AxiosHeaders from './AxiosHeaders.js';

const validators = validator.validators;

/**
 * Create a new instance of Axios
 *
 * @param {Object} instanceConfig The default config for the instance
 *
 * @return {Axios} A new instance of Axios
 */
class Axios {
  constructor(instanceConfig) {
    this.defaults = instanceConfig;
    this.interceptors = {
      request: new InterceptorManager(),
      response: new InterceptorManager()
    };
  }

  /**
   * Dispatch a request
   *
   * @param {String|Object} configOrUrl The config specific for this request (merged with this.defaults)
   * @param {?Object} config
   *
   * @returns {Promise} The Promise to be fulfilled
   */
  request(configOrUrl, config) {
    // Allow for axios('example/url'[, config]) a la fetch API
    if (typeof configOrUrl === 'string') {
      config = config || {};
      config.url = configOrUrl;
    } else {
      config = configOrUrl || {};
    }

    // 将 new 时候的配置和执行 get/post 时候的参数合并
    config = mergeConfig(this.defaults, config);

    const {transitional, paramsSerializer, headers} = config;

    // 进行一些过渡性配置的校验。
    if (transitional !== undefined) {
      validator.assertOptions(transitional, {
        silentJSONParsing: validators.transitional(validators.boolean),
        forcedJSONParsing: validators.transitional(validators.boolean),
        clarifyTimeoutError: validators.transitional(validators.boolean)
      }, false);
    }

    if (paramsSerializer != null) {
      // 如果是函数类型，则将其作为 config.paramsSerializer 的 serialize 属性；否则，进行一些校验。
      if (utils.isFunction(paramsSerializer)) {
        config.paramsSerializer = {
          serialize: paramsSerializer
        }
      } else {
        validator.assertOptions(paramsSerializer, {
          encode: validators.function,
          serialize: validators.function
        }, true);
      }
    }

    // 设置请求的方法，默认值为 get 全部转换为小写
    // 使用 toLowerCase() 来规范化 HTTP 方法是一个比较常见的做法，可以帮助提高代码的可读性和一致性。
    // Set config.method
    config.method = (config.method || this.defaults.method || 'get').toLowerCase();

    // 将 headers 中的通用部分和对应请求方法的部分合并，存储到 contextHeaders 变量中。
    // Flatten headers
    let contextHeaders = headers && utils.merge(
      headers.common,
      headers[config.method]
    );

    // 遍历指定的请求方法和 common，将它们从 headers 中删除。
    headers && utils.forEach(
      ['delete', 'get', 'head', 'post', 'put', 'patch', 'common'],
      (method) => {
        delete headers[method];
      }
    );

    // 😈:调用的是静态方法 返回一个 new 的实例
    config.headers = AxiosHeaders.concat(contextHeaders, headers);

    // -------- start request 拦截器设置 --------
    const requestInterceptorChain = [];
    let synchronousRequestInterceptors = true;

    // 将拦截器的 fulfilled 和 rejected 方法加入到 requestInterceptorChain 数组中。
    // 什么时候塞进数据的? 业务执行的
    this.interceptors.request.forEach(function unshiftRequestInterceptors(interceptor) {
      // 暴露的业务配置:该拦截器不应该执行，直接返回。
      if (typeof interceptor.runWhen === 'function' && interceptor.runWhen(config) === false) {
        return;
      }

      // 确定是否需要同步执行拦截器。
      synchronousRequestInterceptors = synchronousRequestInterceptors && interceptor.synchronous;

      // 将当前拦截器的 fulfilled 和 rejected 回调函数添加到请求拦截器链中。
      // unshift() 方法用于在数组的开头添加元素，这样可以保证后添加的拦截器先执行。
      requestInterceptorChain.unshift(interceptor.fulfilled, interceptor.rejected);
    });
    // -------- end request 拦截器设置 --------

    // -------- start response 拦截器设置 --------
    const responseInterceptorChain = [];

    // 响应拦截器设置
    this.interceptors.response.forEach(function pushResponseInterceptors(interceptor) {
      responseInterceptorChain.push(interceptor.fulfilled, interceptor.rejected);
    });
    // -------- end response 拦截器设置 --------


    let promise;
    let i = 0;
    let len;

    // -------- start 异步拦截器直接执行 --------
    // 如果你不手动 interceptors.request.use(xx, xx, {synchronous: true}) 肯定会进入下面逻辑
    // 如果请求拦截器链中存在异步的则执行此处特殊逻辑 <只要有一个异步的就会进入此逻辑>
    if (!synchronousRequestInterceptors) {
      const chain = [dispatchRequest.bind(this), undefined];

      // chain 头部塞进请求拦截器 尾部放入响应拦截器 使用 apply 可以自动铺平数组。
      chain.unshift.apply(chain, requestInterceptorChain);
      chain.push.apply(chain, responseInterceptorChain);

      len = chain.length;

      promise = Promise.resolve(config);

      // chain 数组逐个添加到 Promise then 后缀
      // 类似洋葱模型, 执行异步的 request 拦截器 --> [请求本身 dispatchRequest, 没有 reject 处理] --> 响应拦截器链
      // 因为每次都是塞进去俩,所以都是一对,可以通过 i++ 获取
      while (i < len) {
        promise = promise.then(chain[i++], chain[i++]);
      }

      // 🤩🤩🤩🤩 正常此处就已经返回了 不用看后面了
      return promise;
    }
    // -------- end 异步拦截器直接执行 --------


    // -------- start 执行 request 拦截器 --------
    // 获取请求拦截器链的长度。
    len = requestInterceptorChain.length;

    // 将最终的配置对象赋值给新变量 newConfig。
    let newConfig = config;

    i = 0;

    // 遍历请求拦截器链，依次调用拦截器的 fulfilled 方法，将返回的新配置对象赋值给 newConfig。
    // 如果在执行过程中捕获到错误，则调用相应的 rejected 方法并退出循环。
    while (i < len) {
      const onFulfilled = requestInterceptorChain[i++];
      const onRejected = requestInterceptorChain[i++];

      // 拦截器返回最终发送请求的配置
      try {
        newConfig = onFulfilled(newConfig);
      } catch (error) {
        onRejected.call(this, error);
        break;
      }
    }
    // -------- end .then 绑定 request 拦截器 --------


    // -------- start 执行 response 拦截器 --------
    // 通过调用 dispatchRequest 函数发送请求，并将返回的 Promise 对象赋值给 promise 变量。
    // 如果在发送请求的过程中捕获到错误，则直接返回一个被拒绝的 Promise 对象。
    try {
      promise = dispatchRequest.call(this, newConfig);
    } catch (error) {
      return Promise.reject(error);
    }

    // 重置索引变量，并获取响应拦截器链的长度。
    i = 0;
    len = responseInterceptorChain.length;

    while (i < len) {
      promise = promise.then(responseInterceptorChain[i++], responseInterceptorChain[i++]);
    }

    return promise;

    // -------- end 执行 response 拦截器 --------
  }

  getUri(config) {
    config = mergeConfig(this.defaults, config);
    const fullPath = buildFullPath(config.baseURL, config.url);
    return buildURL(fullPath, config.params, config.paramsSerializer);
  }
}

// axios 类本身的 request 是一个基础函数,针对不同的方式请求,在 Axios.prototype 绑定不同函数
// 下面两个主要区别就是
// -- 参数位置不同,get 在 config.data 中
// -- post 支持 form 请求

utils.forEach(['delete', 'get', 'head', 'options'], function forEachMethodNoData(method) {
  // method 是 'delete', 'get', 'head', 'options'
  Axios.prototype[method] = function(url, config) {
    return this.request(mergeConfig(config || {}, {
      method,
      url,
      data: (config || {}).data
    }));
  };
});

utils.forEach(['post', 'put', 'patch'], function forEachMethodWithData(method) {
  /*eslint func-names:0*/

  function generateHTTPMethod(isForm) {
    return function httpMethod(url, data, config) {
      return this.request(mergeConfig(config || {}, {
        method,
        headers: isForm ? {
          'Content-Type': 'multipart/form-data'
        } : {},
        url,
        data
      }));
    };
  }

  Axios.prototype[method] = generateHTTPMethod();

  Axios.prototype[method + 'Form'] = generateHTTPMethod(true);
});

export default Axios;
