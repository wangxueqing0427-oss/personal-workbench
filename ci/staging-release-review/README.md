# staging 受控发布通道：非激活审查材料

## 当前交付状态
本分支仅准备审查入口、固定目标和停止规则，不安装任何实际发布/撤回执行器。应用唯一来源为 `6c70c706ce9dec666040b20c41e68b825209be9c`；本分支后续提交只是审查材料，不能冒充应用来源。

- 目标只允许 `personal-workbench-v2-staging`；18项候选、14项旧资源、旧UUID和releaseId见 `channel-lock.json`。
- 默认仅离线检查，`executionEnabled=false`。此前工具的 `liveIO` 硬停止不得移除。
- 不复制私有发布工具、审批票据、旧构建、备份原件、账号标识或任何凭据到此分支。
- 本轮不运行任何云接口，不创建/注入/读取凭据，不发布、不撤回、不合并或更新既有分支。

## workflow_dispatch 限制的实际处理
模板保存在 `ci/staging-release-review/workflow-dispatch.template.yml`，不在 `.github/workflows/`，因此没有可点击的手动入口，也不会触发任何 Actions。模板仅能审查，既不发布也不撤回。checkout保留无效占位符，避免误复制激活。

GitHub要求工作流先存在于默认分支，才可接受workflow_dispatch。本轮不修改main，不通过PR、push、workflow_run或其他事件绕过。未来若采用Actions，须另行批准最小默认分支入口：安装经过独立审核的手动入口，固定工具提交完整SHA，限制目标/分支与人工审批；权限仍只读。此授权不等于本轮已获准安装，也不等于发布程序已就绪。

官方依据：https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow

## 不改main的Linux路线
已有Ubuntu Actions成功运行记录（只证明打包环境）：https://github.com/wangxueqing0427-oss/personal-workbench/actions/runs/42851263001 。当前工作流只允许dry-run，不能转用为发布器。

已有 `personal-workbench-dev` Cloud配置显示ready/runnable，但配置源码仍为4986fd5。本轮不启动或改变该环境。若未来合法进入已有交互式Linux会话，可在其临时隔离目录获取固定应用/审查源码，独立进行人工审批，不需要main上安装workflow。**这只是可行路线，未验证执行会话、可用费用、精确权限或安全凭据输入能力；不能声称当前已能人工发布。** 不创建新服务，不扩大Cloud网络或权限。不明费用即停止。

## 将来的执行门禁（本轮全部只列条件）
1. 先验证执行器精确SHA、目标Worker/account、当前Deployment与Version UUID/100%流量；API首项才是当前部署，不能重排时间推断。
2. 固定应用SHA/releaseId；发布写入前实际核对18项文件、manifest、Worker及配置哈希，不能只接受bundleVerified声明。复用已有Linux dry-run，不冒充本轮重新验证。
3. 版本10备份与共享空间实时只读对应须单独获准；本轮复用历史证据，不能把历史revision/hash当成当前云端证明。
4. 旧资源：部署前公共资产证明与部署后紧急版本专属资产证明必须分离。旧版不必继续服务100%，但缺少可信旧Version绑定资产读取证据必须BLOCKED。14项本地恢复不等于云端保留。
5. 旧清单原始字节有两个哈希：工具2195 bytes/e725b2fae9f5bf3e1ce19e164e58b851a443b7eae69dd38bc512382b8df11449；恢复包1789 bytes/5c72dee0415a30eeca667d24cd7b5a04ac4d9cfa40c5b750de5680129b2bb6c0。JSON内容相同不等于原文件相同。线上原始字节来源未证明，不擅自替换锁值。
6. 发布与撤回分别使用单次、短期、动作专属审批。失败/超时/响应丢失立即停止，保留证据，禁止自动重试和自动撤回。撤回只涉及代码/静态资源，不恢复或迁移Durable Object数据。
7. 后续任何写验收只允许全新隔离合成身份/空间，不能写保护中的共享空间；身份和数据集不明确即停止。

## 凭据：仅未来经批准后的注入要求
本模板和脚本没有凭据引用，也不读取环境凭据。此前未保存Token不可恢复，不索取。

未来若另行批准真实执行，用户只能在官方受保护输入界面直接注入新的短期、精确单Worker权限；聊天、公开源码、命令参数、日志、Artifacts均不可携带。交互式Linux方案还必须证明其安全输入可用；Actions方案还必须另外批准受保护环境配置。成功GET、token状态检查或人工permissionReceipt均不能证明写权/精确范围。无法合法核实实际policy时保持BLOCKED，不能默认扩大权限。

## 本轮安全核验与职责
运行 `node ci/staging-release-review/audit.cjs --self-test`：仅Git只读命令及本地静态文本检查，不执行模板、不运行应用测试、不联网、不安装依赖。检查器不是完整YAML解析器；只接受此处固定的受限模板形状，拒绝新增动作/命令，不宣称能验证任意YAML。

用户提供的最新独立核验：Webhooks=0、main/候选无Actions、Rulesets=0、连接器已有仓库写权限。此为用户交接证据，不冒充本机重新读取；未知外部独立脚本不能绝对排除。本轮按最新指示仅本地提交，远端创建分支/PR交由ChatGPT再次核验后执行。

Codex：准备和本地核验；ChatGPT：独立审查、再次核验推送安全后创建远端新分支和Draft PR；用户：未来必要权限/执行方式及最终发布/撤回分别批准。下一步仅ChatGPT审查本提交，不自动进入执行阶段。
