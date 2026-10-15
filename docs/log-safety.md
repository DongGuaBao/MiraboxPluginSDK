# Node 日志失败保护

- 日志写入有防重入锁；日志内部再次调用日志会被忽略。
- 格式化、文件轮转、写文件和输出均受保护。内部失败不再调用 log.error；全局异常监听器直接调用受保护的写入函数。
- 对象格式化不执行自定义 inspect/getter，限制对象深度、数组元素数和字符串长度。格式化失败用固定标记代替；每条输出最多 64 KiB，超长截断。
- 磁盘写入失败后暂停文件尝试 5 秒，再允许重试；不使用重试队列。
- 控制台使用 console.log / console.warn / console.error，保留调试器及宿主 console 拦截能力；调用前检查对应 stdout/stderr，遇到背压或超过 256 KiB 待写字节时跳过本次控制台副本，不排队重试。文件日志仍正常尝试写入。
- console 同步异常会被吞掉，不递归记录，也不永久禁用 console 钩子。stdout/stderr 的异步 error 会禁用该输出流的 SDK 控制台日志，文件输出不受影响。自定义 console 钩子自行维护的缓冲不在 stdout/stderr 检查范围内。

这些保护只覆盖 SDK log，不保护业务自行调用 console.log 或其他日志库。磁盘同步写入仍可能阻塞事件循环；不可恢复进程错误是否退出沿用原行为，本次不改变宿主/插件的退出策略。

验证：`npm run test:log-safety` 或 `npm run check`。
