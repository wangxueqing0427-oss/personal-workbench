# V2.0 隐私密钥设计核查（2026-11-13）

## 结论

**不把浏览器 PIN 遮罩、WebAuthn 验证成功与真正的本地磁盘加密混为一谈。**

1. iPhone Safari 支持一般 WebAuthn/Passkeys，但 WebAuthn 的 `userVerification: "required"` 只是身份验证信号，不能自动产生可稳定解密 IndexedDB/附件的 256 位密钥。
2. PRF 扩展可以从同一认证凭据和输入导出可复现的伪随机秘密，适合作为密钥封装设计的一种研究方向；但跨平台认证器与 Safari 平台上的支持存在明显差异。苹果 Safari 26.4 版本说明提到安全密钥 CTAP `hmac-secret`/PRF，**不能从中直接推出 iPhone Face ID/passkey 的 PRF 输出可用于生产解密**；截至本次核查，Caniuse 的 iOS Safari `credentials.get({ publicKey: { extensions: { prf } } })` 兼容性表仍标记不支持。必须实机通过完整创建凭据→授权→PRF 输出一致性→失效与恢复测试，且 PRF 缺失时必须停止，不能退化为明文持钥。
3. 在缺少可靠生物识别密钥来源前，可通过独立高熵恢复口令 + PBKDF2 + AES-GCM 的原型验证业务资料、PDF/照片字节、索引和备份密文隔离。**它不是免密码 Face ID，也不能证明生产可用。**6位数字 PIN 只作为 UI 遮挡，不作为可离线暴力破解的资料密钥。

## 来源（技术决策依据）

- [MDN：WebAuthn `prf` 扩展](https://developer.mozilla.org/en-US/docs/Web/API/Web_Authentication_API/WebAuthn_extensions)
- [Apple：Safari 26.4 Release Notes / Web Authentication PRF](https://developer.apple.com/documentation/safari-release-notes/safari-26_4-release-notes)
- [Caniuse：Safari iOS `credentials.get()` PRF 兼容性](https://caniuse.com/mdn-api_credentialscontainer_get_publickey_option_extensions_prf)
- [Yubico：PRF 开发者指南与 iOS 限制](https://developers.yubico.com/WebAuthn/Concepts/PRF_Extension/Developers_Guide_to_PRF.html)
- [WebKit：WebAuthn PRF CTAP 外部安全密钥问题](https://bugs.webkit.org/show_bug.cgi?id=311099)

## 本轮已经写入的纯合成原型

- `privacy-crypto-poc.js`：只接受随机名称 `personal-workbench-v2-crypto-poc-UUID` 的独立 IndexedDB；新建 AES-GCM 256-bit DEK，使用高强度恢复口令 PBKDF2-SHA256 310000轮封装DEK；**DEK解封后的 WebCrypto CryptoKey 禁止导出**；数据记录与二进制原件均存放随机 IV/AAD 认证密文，文件名和元数据一起加密。最大单个原件8MiB，仅供试验。
- AES-GCM `additionalData` 绑定格式、vault ID、对象 ID、类型、修订号，调包、类型混淆或过期修订号都会失败。
- 密文备份包含完整加密记录及独立加密认证清单（记录总数与哈希），**删除一条或改写一条都必须拒绝恢复**；恢复只能写入另一随机、新建且原本不存在的试验库。
- 支持在不更改现有密文记录/文件的条件下更换恢复口令，并拒绝陈旧修订号覆盖。
- `privacy-shadow-poc.js`：仅在本机回环地址并带自动化测试标记时，可**只读扫描**合成 V2 `personal-workbench-v2-demo` 的业务记录、队列和所有附件，双次核验来源不变、原件字节哈希一致后，复制到全新加密影子库，再完整解密恢复到第三个隔离库核验；如果存在真实云端身份/冲突、缺原件、不支持结构或超容量，必须失败。**不在部署预览站点提供此工具，也不用于真实用户数据。**

## 重要剩余风险

- 高强度恢复口令并不等于硬件保管。用户口令弱时仍可遭到离线口令猜测；密码丢失可能造成无法读取密文。真正产品要设计安全恢复与用户可理解的备份流程。
- 浏览器同源恶意脚本、运行中已解密的内存、XSS/供应链、设备被完全控制等不能靠 AES-GCM 静态存储本身解决；必须搭配严格资源完整性与内容安全策略、最小权限、密钥生命周期、锁屏防窥。
- 这是单机独立原型，尚未接入 V2 正式业务接口；也没有执行真实 V1.5.7 本地迁移、登录身份发放、长期云端自动同步或生产级性能/灾备验证。
- 浏览器自动化 WebKit ≠ iPhone 真机 Safari/PWA。PRF 能否被 Face ID 驱动并持续稳定地提供解密材料仍必须用真正目标 iPhone 实测。不能因通用 WebAuthn 检测为真便宣布 Face ID 加密功能完成。
- 必须先获得用户明确批准，才能碰真实业务数据、正式部署或改变云端生产配置。

## 下一道门禁

待这两个隔离原型在 Chromium/WebKit 自动化完成绿色检查后，再设计不依赖 WebAuthn PRF 的高强度恢复密码作为底线方案；若未来PRF目标iPhone实测确认，则将平台验证路径加进密钥封装，而不是只做身份确认动画。没有全部门禁的证据前，原 V1.5.7、原 V2 staging、正式云端与用户资料保持不变。
