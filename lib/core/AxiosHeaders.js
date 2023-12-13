'use strict';

import utils from '../utils.js';
import parseHeaders from '../helpers/parseHeaders.js';

// 定义了一个名为 $internals 的 Symbol 常量，用于内部使用。
const $internals = Symbol('internals');

// 规范化传入的 header 名称，将其转换为小写并去除首尾空格。
function normalizeHeader(header) {
  return header && String(header).trim().toLowerCase();
}

// 规范化传入的 header 值，将其转换为字符串或字符串数组。
function normalizeValue(value) {
  if (value === false || value == null) {
    return value;
  }

  return utils.isArray(value) ? value.map(normalizeValue) : String(value);
}

// 解析传入的 header 字符串，将其转换为对象。
function parseTokens(str) {
  const tokens = Object.create(null);
  // 匹配 header 字符串中的 key=value 对，例如：'key1=value1, key2=value2'
  const tokensRE = /([^\s,;=]+)\s*(?:=\s*([^,;]+))?/g;
  let match;

  while ((match = tokensRE.exec(str))) {
    tokens[match[1]] = match[2];
  }

  // 返回解析后的对象
  return tokens;
}

// 判断传入的 header 名称是否合法 (是否包含非法字符)。
const isValidHeaderName = (str) => /^[-_a-zA-Z0-9^`|~,!#$%&'*+.]+$/.test(str.trim());

// 判断传入的 header 值是否匹配指定的过滤器。
// 如果 filter 是函数，则调用该函数并传入 value 和 header 两个参数，返回值为 true 时表示匹配成功。
function matchHeaderValue(context, value, header, filter, isHeaderNameFilter) {
  if (utils.isFunction(filter)) {
    return filter.call(this, value, header);
  }

  if (isHeaderNameFilter) {
    value = header;
  }

  if (!utils.isString(value)) return;

  if (utils.isString(filter)) {
    return value.indexOf(filter) !== -1;
  }

  if (utils.isRegExp(filter)) {
    return filter.test(value);
  }
}

// 格式化 header 名称，将其转换为驼峰命名格式。
// 例如：'content-type' => 'Content-Type'
function formatHeader(header) {
  return header.trim()
    .toLowerCase().replace(/([a-z\d])(\w*)/g, (w, char, str) => {
      return char.toUpperCase() + str;
    });
}

// 构建访问器，为指定的 header 名称构建 get/set/has 三个访问器。
// 例如：buildAccessors(obj, 'Content-Type') => obj.getContentType() / obj.setContentType() / obj.hasContentType()
// 该方法会将访问器挂载到 obj 对象上。
function buildAccessors(obj, header) {
  const accessorName = utils.toCamelCase(' ' + header);

  ['get', 'set', 'has'].forEach(methodName => {
    Object.defineProperty(obj, methodName + accessorName, {
      value: function(arg1, arg2, arg3) {
        return this[methodName].call(this, header, arg1, arg2, arg3);
      },
      configurable: true
    });
  });
}

// 定义 AxiosHeaders 类，用于管理请求头。
class AxiosHeaders {
  constructor(headers) {
    headers && this.set(headers);
  }

  // 为当前实例对象添加指定的 header。
  // 例如：set('Content-Type', 'application/json') => this['Content-Type'] = 'application/json'
  set(header, valueOrRewrite, rewrite) {
    const self = this;

    function setHeader(_value, _header, _rewrite) {
      const lHeader = normalizeHeader(_header);

      if (!lHeader) {
        throw new Error('header name must be a non-empty string');
      }

      const key = utils.findKey(self, lHeader);

      if(!key || self[key] === undefined || _rewrite === true || (_rewrite === undefined && self[key] !== false)) {
        self[key || _header] = normalizeValue(_value);
      }
    }

    const setHeaders = (headers, _rewrite) =>
      utils.forEach(headers, (_value, _header) => setHeader(_value, _header, _rewrite));

    // 如果 header 是一个对象或 AxiosHeaders 实例，则遍历该对象并调用 setHeader 方法。
    if (utils.isPlainObject(header) || header instanceof this.constructor) {
      setHeaders(header, valueOrRewrite)
    }
    // 如果 header 是一个数组，则遍历该数组并调用 setHeader 方法。
    else if(utils.isString(header) && (header = header.trim()) && !isValidHeaderName(header)) {
      setHeaders(parseHeaders(header), valueOrRewrite);
    } else {
      header != null && setHeader(valueOrRewrite, header, rewrite);
    }

    return this;
  }

  get(header, parser) {
    header = normalizeHeader(header);

    if (header) {
      const key = utils.findKey(this, header);

      if (key) {
        const value = this[key];

        if (!parser) {
          return value;
        }

        if (parser === true) {
          return parseTokens(value);
        }

        if (utils.isFunction(parser)) {
          return parser.call(this, value, key);
        }

        if (utils.isRegExp(parser)) {
          return parser.exec(value);
        }

        throw new TypeError('parser must be boolean|regexp|function');
      }
    }
  }

  has(header, matcher) {
    header = normalizeHeader(header);

    if (header) {
      const key = utils.findKey(this, header);

      return !!(key && this[key] !== undefined && (!matcher || matchHeaderValue(this, this[key], key, matcher)));
    }

    return false;
  }

  delete(header, matcher) {
    const self = this;
    let deleted = false;

    function deleteHeader(_header) {
      _header = normalizeHeader(_header);

      if (_header) {
        const key = utils.findKey(self, _header);

        if (key && (!matcher || matchHeaderValue(self, self[key], key, matcher))) {
          delete self[key];

          deleted = true;
        }
      }
    }

    if (utils.isArray(header)) {
      header.forEach(deleteHeader);
    } else {
      deleteHeader(header);
    }

    return deleted;
  }

  clear(matcher) {
    const keys = Object.keys(this);
    let i = keys.length;
    let deleted = false;

    while (i--) {
      const key = keys[i];
      if(!matcher || matchHeaderValue(this, this[key], key, matcher, true)) {
        delete this[key];
        deleted = true;
      }
    }

    return deleted;
  }

  normalize(format) {
    const self = this;
    const headers = {};

    utils.forEach(this, (value, header) => {
      const key = utils.findKey(headers, header);

      if (key) {
        self[key] = normalizeValue(value);
        delete self[header];
        return;
      }

      const normalized = format ? formatHeader(header) : String(header).trim();

      if (normalized !== header) {
        delete self[header];
      }

      self[normalized] = normalizeValue(value);

      headers[normalized] = true;
    });

    return this;
  }

  // 将当前实例对象与指定的 header 对象合并。
  concat(...targets) {
    // this.constructor指向当前实例对象的构造函数，也就是AxiosHeaders类本身
    // concat 执行的是静态 concat 方法
    return this.constructor.concat(this, ...targets);
  }

  toJSON(asStrings) {
    const obj = Object.create(null);

    utils.forEach(this, (value, header) => {
      value != null && value !== false && (obj[header] = asStrings && utils.isArray(value) ? value.join(', ') : value);
    });

    return obj;
  }

  [Symbol.iterator]() {
    return Object.entries(this.toJSON())[Symbol.iterator]();
  }

  toString() {
    return Object.entries(this.toJSON()).map(([header, value]) => header + ': ' + value).join('\n');
  }

  get [Symbol.toStringTag]() {
    return 'AxiosHeaders';
  }

  // 从指定的对象创建 AxiosHeaders 实例。
  static from(thing) {
    // 如果 thing 是 AxiosHeaders 实例，则直接返回该实例。
    return thing instanceof this ? thing : new this(thing);
  }

  // 从指定的对象创建 AxiosHeaders 实例。
  static concat(first, ...targets) {
    const computed = new this(first);

    // 将 targets 数组中的每个元素都添加到 computed 实例对象中。
    targets.forEach((target) => computed.set(target));

    return computed;
  }

  // 为 AxiosHeaders 类定义访问器。
  static accessor(header) {
    // this 指向 AxiosHeaders 类本身
    const internals = this[$internals] = (this[$internals] = {
      accessors: {}
    });

    // 为指定的 header 名称构建访问器。
    const accessors = internals.accessors;
    // this.prototype指向AxiosHeaders类的原型对象
    const prototype = this.prototype;

    // 定义一个内部方法，用于为指定的 header 名称构建访问器。
    function defineAccessor(_header) {
      const lHeader = normalizeHeader(_header);

      if (!accessors[lHeader]) {
        buildAccessors(prototype, _header);
        accessors[lHeader] = true;
      }
    }

    // 如果 header 是一个数组，则遍历该数组并调用 defineAccessor 方法。
    utils.isArray(header) ? header.forEach(defineAccessor) : defineAccessor(header);

    // 返回 AxiosHeaders 类本身。
    return this;
  }
}

// 定义了一组默认的 header 名称，这些 header 名称不需要通过 get/set/has 方法来访问。
AxiosHeaders.accessor(['Content-Type', 'Content-Length', 'Accept', 'Accept-Encoding', 'User-Agent', 'Authorization']);

// 修复了一些 header 名称的访问器定义错误。
// 修复后：'Content-Type' => 'ContentType' / 'Content-Type' => 'ContentType' / 'Content-Type' => 'ContentType'
utils.reduceDescriptors(AxiosHeaders.prototype, ({value}, key) => {
  let mapped = key[0].toUpperCase() + key.slice(1); // map `set` => `Set`
  return {
    get: () => value,
    set(headerValue) {
      this[mapped] = headerValue;
    }
  }
});

// 冻结了 AxiosHeaders 类的原型对象，防止被修改。
utils.freezeMethods(AxiosHeaders);

export default AxiosHeaders;
