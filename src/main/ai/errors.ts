export interface ClassifiedAIError {
  code: string
  retryable: boolean
}

const LOCAL_HOST_RE = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?=[:/]|$)/i

/**
 * 将 HTTP 状态码与底层网络报错归类为面向用户的结构化错误码与重试策略
 */
export function classifyAIError(
  status: number | undefined,
  rawMessage: string,
  baseUrl: string
): ClassifiedAIError {
  if (status === 401 || status === 403) {
    return { code: 'AUTH_FAILED', retryable: false }
  }
  if (status === 402) {
    return { code: 'INSUFFICIENT_QUOTA', retryable: false }
  }
  if (status === 404) {
    return { code: 'ENDPOINT_OR_MODEL_NOT_FOUND', retryable: false }
  }
  if (status === 429) {
    return { code: 'RATE_LIMITED', retryable: true }
  }
  if (status != null && status >= 500 && status <= 599) {
    return { code: 'UPSTREAM_UNAVAILABLE', retryable: true }
  }

  const msg = rawMessage.toLowerCase()
  const isLocal = LOCAL_HOST_RE.test(baseUrl)
  if (isLocal && /econnrefused|connection refused|fetch failed/.test(msg)) {
    return { code: 'LOCAL_SERVER_OFFLINE', retryable: false }
  }
  if (/enotfound|econnreset|etimedout|econnrefused|err_proxy|fetch failed|network|socket/.test(msg)) {
    return { code: 'NETWORK_ERROR', retryable: true }
  }
  return { code: '', retryable: false }
}
