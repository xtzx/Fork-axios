'use strict';

import utils from '../utils.js';
import AxiosURLSearchParams from '../helpers/AxiosURLSearchParams.js';

/**
 * It replaces all instances of the characters `:`, `$`, `,`, `+`, `[`, and `]` with their
 * URI encoded counterparts
 *
 * @param {string} val The value to be encoded.
 *
 * @returns {string} The encoded value.
 */
function encode(val) {
  // 下面这些字符在 URL 中常常用于表示特殊含义或作为分隔符，因此需要进行转义以确保它们能够正确地传递和解析。
  return encodeURIComponent(val).
    replace(/%3A/gi, ':').
    replace(/%24/g, '$').
    replace(/%2C/gi, ',').
    replace(/%20/g, '+').
    replace(/%5B/gi, '[').
    replace(/%5D/gi, ']');
}

/**
 * Build a URL by appending params to the end
 *
 * @param {string} url The base of the url (e.g., http://www.google.com)
 * @param {object} [params] The params to be appended
 * @param {?object} options
 *
 * @returns {string} The formatted url
 */
export default function buildURL(url, params, options) {
  if (!params) {
    return url;
  }

  // 定义一个 _encode 变量，用于存储编码函数。如果 options 存在且其 encode 属性存在，则使用 options.encode；否则，默认使用全局的 encode 函数。
  const _encode = options && options.encode || encode;

  // 定义一个 serializeFn 变量，用于存储序列化函数。如果 options 存在且其 serialize 属性存在，则使用 options.serialize。
  const serializeFn = options && options.serialize;

  // 存储序列化后的参数。
  let serializedParams;

  if (serializeFn) {
    serializedParams = serializeFn(params, options);
  } else {
    // 判断 params 是否为 URLSearchParams 对象。如果是，则调用 params.toString() 方法将其转换为字符串；
    serializedParams = utils.isURLSearchParams(params) ?
      params.toString() :
      // 如果不是，则创建一个新的 AxiosURLSearchParams 对象，并调用其 toString 方法进行序列化，传入编码函数 _encode。
      new AxiosURLSearchParams(params, options).toString(_encode);
  }

  if (serializedParams) {
    // 判断是否存在哈希部分。
    const hashmarkIndex = url.indexOf("#");

    // 将序列化后的参数字符串 serializedParams 拼接到 url 后面，根据原始 url 是否已经包含查询参数来决定连接符是 ? 还是 &。
    if (hashmarkIndex !== -1) {
      url = url.slice(0, hashmarkIndex);
    }
    url += (url.indexOf('?') === -1 ? '?' : '&') + serializedParams;
  }

  return url;
}
