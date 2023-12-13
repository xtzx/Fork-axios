'use strict';

import transformData from './transformData.js';
import isCancel from '../cancel/isCancel.js';
import defaults from '../defaults/index.js';
import CanceledError from '../cancel/CanceledError.js';
import AxiosHeaders from '../core/AxiosHeaders.js';
import adapters from "../adapters/adapters.js";

/**
 * 如果请求取消，则抛出“CanceledError”。
 *
 * @param {Object} config The config that is to be used for the request
 * @returns {void}
 */
function throwIfCancellationRequested(config) {
  if (config.cancelToken) {
    config.cancelToken.throwIfRequested();
  }

  if (config.signal && config.signal.aborted) {
    throw new CanceledError(null, config);
  }
}

/**
 *使用配置的适配器向服务器发送请求。
 *
 * @param {object} config The config that is to be used for the request
 * @returns {Promise} The Promise to be fulfilled
 */
export default function dispatchRequest(config) {
  throwIfCancellationRequested(config);

  config.headers = AxiosHeaders.from(config.headers);

  // 请求参数处理
  config.data = transformData.call(
    config,
    config.transformRequest
  );

  if (['post', 'put', 'patch'].indexOf(config.method) !== -1) {
    // POST 请求通常用于向服务器提交数据，而数据的格式可以有多种方式，例如 JSON、表单数据等。
    // 默认情况下，Axios（假设这里使用的是 Axios 库）会将请求头的 Content-Type 设置为 application/json，适用于发送 JSON 格式的数据。
    // 但是，如果要以 application/x-www-form-urlencoded 的编码格式发送数据，就需要单独设置请求头的 Content-Type。
    // 通过 descriptors 实现
    config.headers.setContentType('application/x-www-form-urlencoded', false);
  }

  // 适配器逻辑 browser or node
  const adapter = adapters.getAdapter(config.adapter || defaults.adapter);

  return adapter(config).then(function onAdapterResolution(response) {
    throwIfCancellationRequested(config);

    // Transform response data
    response.data = transformData.call(
      config,
      config.transformResponse,
      response
    );

    response.headers = AxiosHeaders.from(response.headers);

    return response;
  }, function onAdapterRejection(reason) {
    if (!isCancel(reason)) {
      throwIfCancellationRequested(config);

      // Transform response data
      if (reason && reason.response) {
        reason.response.data = transformData.call(
          config,
          config.transformResponse,
          reason.response
        );
        reason.response.headers = AxiosHeaders.from(reason.response.headers);
      }
    }

    return Promise.reject(reason);
  });
}
