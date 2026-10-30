import { useState } from "react";
import { Link } from "react-router-dom";
import { Check, Copy, Download, ExternalLink, ShieldCheck, Sparkles } from "lucide-react";
import { useData } from "../hooks/use-data";
import { copyText, errorMessage } from "../lib/api";
import { QueryFeedback } from "../feedback";
import { GlobalFooter } from "../footer";

type SkillManifest = {
  title: string;
  intro: string;
  sections: { id: string; title: string }[];
  bundleUrl: string;
  skills: {
    slug: string;
    title: string;
    section: string;
    summary: string;
    source: string;
    homepage: string;
    url: string;
    files: number;
    bytes: number;
    downloadUrl: string;
  }[];
};

const features = [
  ["轻量化部署", "针对 16GB 内存和普通 Intel CPU 优化，不依赖本地大模型，也不默认安装 PyTorch、TensorFlow、MONAI、nnU-Net 等重型组件。"],
  ["本地数据工具", "数据脱敏、OCR、图片转换、DICOM 元数据匿名化、比例尺添加、图片拼接和分辨率检查等工作可由本地脚本完成。"],
  ["医疗科研全流程", "覆盖从研究设计、样本量计算、数据处理、统计分析到论文检查、图表制作和审稿回复的常用科研流程。"],
  ["人工审核机制", "研究方案、统计结论、伦理材料、论文内容和图像解读均应由研究人员、统计人员或其他具备相应资质的专业人员审核。"],
] as const;

const exclusions = [
  "疾病诊断、影像诊断、病理诊断",
  "个体化治疗建议、处方或药物剂量建议",
  "患者分诊或临床决策",
  "自动伦理审批或替代专业统计审核",
];

export default function SkillsPage({ embedded = false }: { embedded?: boolean }) {
  const query = useData<SkillManifest>("skills", "/skills");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const data = query.data;
  const origin = window.location.origin;

  const installCommand = `# 一键安装全部 ${data?.skills.length ?? 22} 项医疗科研技能（Claude Code + Codex / Cursor）
mkdir -p ~/.claude/skills ~/.agents/skills
curl -fsSL ${origin}/api/skills/bundle.tar.gz | tar -xz -C ~/.claude/skills
cp -R ~/.claude/skills/* ~/.agents/skills/
echo "已安装，重启 Claude Code / Codex 后生效"`;

  const copyInstall = async () => {
    setCopied(false);
    setError("");
    try {
      await copyText(installCommand);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const header = (
    <header className="border-b border-orange-100 bg-white/90">
      <div className="mx-auto max-w-7xl px-5 h-[72px] flex items-center justify-between">
        <Link to="/" className="flex items-center gap-3 font-semibold text-lg">
          <img decoding="async" loading="eager" src="/brand/mascot.webp" className="h-11 w-11 object-cover object-top rounded-full bg-orange-100" alt="工作坊吉祥物" />
          虾壳医疗科研助手
        </Link>
        <nav aria-label="页面导航" className="flex gap-3 items-center">
          <Link to="/" className="hidden sm:block text-sm text-slate-600 hover:text-orange-600">返回官网</Link>
          <Link to="/register" className="bg-orange-500 hover:bg-orange-600 text-white rounded-lg px-4 py-2 text-sm font-medium">免费注册</Link>
        </nav>
      </div>
    </header>
  );

  return (
    <div className="min-h-screen bg-[#fffdf9] text-slate-900">
      {!embedded && header}
      <main className={embedded ? "space-y-6" : "mx-auto max-w-7xl px-5"}>
        <div className="border-b border-orange-100 py-14 md:py-16">
          <div className="mx-auto max-w-3xl text-center space-y-5">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-orange-200 bg-orange-50 px-4 py-1.5 text-xs font-medium text-orange-700">
              <Sparkles size={14} /> 22 项医疗科研与图像处理技能 · 开源可安装
            </span>
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight">{data?.title ?? "虾壳医疗科研助手"}</h1>
            <p className="text-slate-600 leading-relaxed">{data?.intro ?? "技能加载中…"}</p>
          </div>
          <div className="mx-auto mt-8 max-w-3xl space-y-3">
            <QueryFeedback query={query} label="技能清单" />
            {data && (
              <div className="rounded-xl border border-orange-200 bg-white p-5 shadow-sm">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h2 className="font-semibold">一键复制下载安装指令</h2>
                  <button
                    type="button"
                    onClick={copyInstall}
                    className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-orange-600"
                  >
                    {copied ? <Check size={16} /> : <Copy size={16} />}
                    {copied ? "已复制" : "复制安装指令"}
                  </button>
                </div>
                <pre className="whitespace-pre-wrap break-all rounded-lg bg-slate-50 p-4 text-xs leading-relaxed text-slate-700">{installCommand}</pre>
                <p className="mt-3 text-xs text-slate-500">
                  安装目录：<code className="rounded bg-slate-100 px-1">~/.claude/skills</code>（Claude Code / Cursor）与
                  <code className="rounded bg-slate-100 px-1">~/.agents/skills</code>（Codex / GitHub Copilot）。重启 Agent 后生效。
                </p>
                <p className="mt-1 text-xs text-red-600">{error}</p>
              </div>
            )}
          </div>
        </div>

        <div className={embedded ? "" : "mx-auto max-w-7xl px-5 py-12"}>
          {data && (
            <div className="space-y-14">
              {data.sections.map((section, index) => {
                const skills = data.skills.filter(s => s.section === section.id);
                if (!skills.length) return null;
                return (
                  <section key={section.id} aria-labelledby={"section-" + section.id}>
                    <div className="mb-5 flex items-center gap-3">
                      <span className="grid h-9 w-9 place-items-center rounded-full bg-orange-100 text-sm font-bold text-orange-700">{index + 1}</span>
                      <h2 id={"section-" + section.id} className="text-xl font-semibold md:text-2xl">{section.title}</h2>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      {skills.map(skill => (
                        <article key={skill.slug} className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 transition-shadow hover:shadow-sm">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <h3 className="font-semibold leading-snug">{skill.title}</h3>
                              <code className="mt-1 inline-block rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">{skill.slug}</code>
                            </div>
                            <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-500">{skill.files} 个文件 · {(skill.bytes / 1024).toFixed(0)} KB</span>
                          </div>
                          <p className="mt-3 flex-1 text-sm leading-7 text-slate-600">{skill.summary}</p>
                          <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-slate-100 pt-3 text-xs">
                            <a href={skill.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-orange-700 hover:underline">
                              <ExternalLink size={13} /> GitHub 源码
                            </a>
                            <a href={skill.downloadUrl} className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-800">
                              <Download size={13} /> 单个下载
                            </a>
                          </div>
                        </article>
                      ))}
                    </div>
                  </section>
                );
              })}

              <section aria-labelledby="features-heading">
                <h2 id="features-heading" className="text-xl font-semibold md:text-2xl">产品特点</h2>
                <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {features.map(([title, body]) => (
                    <div key={title} className="rounded-2xl border border-slate-200 bg-white p-5">
                      <h3 className="font-semibold">{title}</h3>
                      <p className="mt-2 text-sm leading-7 text-slate-600">{body}</p>
                    </div>
                  ))}
                </div>
              </section>

              <section aria-labelledby="scope-heading" className="rounded-2xl border border-amber-200 bg-amber-50/60 p-6">
                <h2 id="scope-heading" className="flex items-center gap-2 font-semibold text-amber-900">
                  <ShieldCheck size={18} /> 使用范围说明
                </h2>
                <p className="mt-3 text-sm leading-7 text-amber-900">
                  本产品用于医疗科研、科研教育和医学文档辅助，不提供：{exclusions.join("；")}。
                </p>
                <p className="mt-2 text-sm leading-7 text-amber-900">
                  DICOM 脱敏主要处理文件元数据；对于已经直接显示在图像像素中的姓名、病案号等信息，仍需进行遮挡、裁剪或人工复核。放大图片或修改 DPI 不会生成原始图像中不存在的实验细节，不应用于改变、补造或美化科研结果。
                </p>
              </section>

              <section aria-labelledby="source-heading" className="rounded-2xl border border-slate-200 bg-white p-6">
                <h2 id="source-heading" className="font-semibold">开源项目与许可</h2>
                <p className="mt-3 text-sm leading-7 text-slate-600">
                  技能来自两个 MIT 协议开源项目：<a href="https://github.com/Aperivue/medsci-skills" target="_blank" rel="noreferrer" className="text-orange-700 hover:underline">Aperivue/medsci-skills</a>
                  （研究设计、统计、论文规范检查与写作）与 <a href="https://github.com/aipoch/medical-research-skills" target="_blank" rel="noreferrer" className="text-orange-700 hover:underline">aipoch/medical-research-skills</a>
                  （医疗科研图像处理）。开源组件应按照各项目及其内置资源对应的许可证使用；正式使用时建议固定经过审核的版本。
                </p>
              </section>
            </div>
          )}
        </div>
      </main>
      {!embedded && <GlobalFooter />}
    </div>
  );
}