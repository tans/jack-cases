import { Link } from "react-router-dom";
import { ShieldCheck } from "lucide-react";
import { useData } from "./hooks/use-data";

const brand = "/brand/";
export const legalLinks = [
  ["隐私政策", "/legal/privacy"],
  ["服务条款", "/legal/terms"],
  ["信息安全", "/legal/security"],
  ["帮助中心", "/legal/help"],
] as const;

export function GlobalFooter() {
  const query = useData<{ id: string; name: string; count: number }[]>("footer-tags", "/tags/popular");
  const tags = query.data ?? [];
  return (
    <footer className="mt-auto border-t border-white/10 bg-[#0b1220] text-slate-400">
      <div className="mx-auto max-w-7xl px-6 py-16 md:py-20 lg:px-8">
        <div className="grid gap-12 md:grid-cols-2 lg:grid-cols-[1.2fr_1.5fr_1.2fr]">
          <div className="space-y-5">
            <Link to="/" className="inline-flex items-center gap-3">
              <img decoding="async" loading="eager" src={brand + "mascot.webp"} className="h-12 w-12 rounded-full bg-orange-100 object-cover object-top" alt="医疗大健康需求平台标识" />
              <span className="text-lg font-semibold text-slate-100">医疗大健康需求平台</span>
            </Link>
            <p className="max-w-md text-sm leading-7">面向医药流通、医院与健康服务、IVD 等领域，记录真实问题、整理需求材料，结合业务场景与 AI 一起澄清需求。</p>
            <Link to="/skills" className="inline-flex items-center gap-2 text-sm text-orange-300/90 transition-colors hover:text-orange-200">
              虾壳医疗科研助手 · 22 项科研技能 →
            </Link>
            <p className="text-sm text-orange-300/90">Powered by 杰哥AI工作坊 · Jack Cases</p>
          </div>
          <nav aria-label="热门标签">
            <h2 className="footer-title text-slate-200">热门标签</h2>
            {tags.length ? (
              <ul className="mt-5 flex max-w-md flex-wrap gap-2">
                {tags.map(tag => (
                  <li key={tag.id}>
                    <Link to={"/?tagIds=" + encodeURIComponent(tag.id)} className="badge badge-outline badge-sm border-white/20 text-slate-300 transition-colors hover:border-orange-400 hover:bg-orange-500/10 hover:text-orange-200">
                      {tag.name}
                      <span className="ml-1 tabular-nums text-slate-500">{tag.count}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 text-sm text-slate-500">标签整理中，敬请期待。</p>
            )}
          </nav>
          <nav aria-label="平台服务" className="justify-self-end text-right">
            <h2 className="footer-title text-slate-200">服务支持</h2>
            <ul className="mt-5 flex flex-col items-end space-y-3 text-sm">
              {legalLinks.map(([label, to]) => (
                <li key={to}>
                  <Link to={to} className="inline-flex items-center gap-2 text-slate-400 transition-colors hover:text-orange-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-300">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
        <div className="mt-14 flex flex-col items-center justify-between gap-4 border-t border-white/10 pt-8 text-xs text-slate-500 md:flex-row">
          <p>© {new Date().getFullYear()} 杰哥AI工作坊 · Jack Cases · 医疗大健康需求平台</p>
          <p className="flex items-center gap-1.5">
            <ShieldCheck size={14} />HTTPS 传输 · 权限控制 · 人工审核
          </p>
        </div>
      </div>
    </footer>
  );
}