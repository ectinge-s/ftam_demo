/* ═══════════════════════════════════════════
   CAREER PLAN VIEW — Planning 页第三视图「我的规划」
   ───────────────────────────────────────────
   完整复刻归档项目「我的规划」(60-personal-plan.js / sfk-plan-v2) 的报告生成逻辑，
   落在当前站点已有的数据上（不新增任何数据文件）：
     - data/programs.json           → DDL 解析 / 作品集要求归并 / 专业方向分布 / 阶段路线图
     - data/career_planning.json    → 职业方向 → AI 工具建议（rolePools，站内已迁移但此前未接入UI）
     - data/internship_resources.json → 岗位 → 实习/AI项目资源库（roleMap，站内已迁移但此前未接入UI）
     - data/courses_academic.json   → 寒暑校/大师课/AI商业实践（站内已迁移但此前未接入UI，
       字段与归档 SFK_LEARNING_RESOURCES 完全对应：suitable_for=方向track，season=学期）
     - CareerCart（career-cart.js） → 岗位库里选出的最多3个职业目标（主/次/探索）

   流程对齐归档项目「sfk-plan-v2」的分步向导（P.step + stepBar），而非单页纵向滚动：
     第一步 选择规划类型（留学规划 / 我的职业规划 / 留学+就业双规划）
     第二步 确认职业目标（仅留学规划跳过；读取 CareerCart，跳转岗位库选择）
     第三步 申请范围（层级 / 国家 / 申请季，仅纯职业规划跳过）
     第四步 选择具体院校与专业（按院校分组呈现，仅纯职业规划跳过）
     报告   独立呈现为单独页面：概览、专业分布、作品集产出汇总、阶段执行计划、
            学习/实践/背景提升候选（可交互加入时间线）、申请要求与DDL总表、
            职业目标三段行业经历（实习/AI项目资源匹配）、按月关键节点、PDF导出
            页面顶部提供「返回修改选择／重新生成／清空重新开始」等操作。

   范围说明（与归档项目的差异，均因当前数据不具备而做的合理裁剪，非偷懒省略）：
     - 不做归档项目里的多学生本地档案管理／本地存档切换（已与用户确认过，单一进行中的规划即可；
       但保留「学生姓名」字段，用于标注报告标题与导出的 PDF，对应归档里报告随学生姓名呈现的效果）
     - 不复刻「规划价值」模块的营销话术模板（archived 依赖 SFK_VALUE_PROPOSITIONS，站内无对应数据）
═══════════════════════════════════════════ */

/* ── 通用转义（学生姓名等为用户输入，其余字段均来自站内数据） ── */
function cpEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ── DDL 文本解析（移植自归档项目 60-personal-plan.js） ── */
const CP_EN_MONTHS = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8,
  september: 9, october: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

function cpDateForMonthDay(month, day, cycleYear) {
  let y = cycleYear;
  if (month >= 8) y -= 1; // Fall 申请季：8月及以后的截止日期属于上一年历
  return new Date(y, month - 1, day || 1);
}

function cpDeadlineCandidatesFromClause(clause, cycleYear) {
  const values = [];
  let m;
  const push = (month, day) => {
    const d = cpDateForMonthDay(Number(month), Number(day), cycleYear);
    if (!isNaN(d)) values.push(d);
  };
  const iso = /\b20\d{2}[-/.](\d{1,2})[-/.](\d{1,2})\b/g;
  while ((m = iso.exec(clause))) push(m[1], m[2]);
  const zh = /(?:20\d{2}\s*年\s*)?(\d{1,2})\s*月\s*(\d{1,2})\s*日/g;
  while ((m = zh.exec(clause))) push(m[1], m[2]);
  const en1 = /\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b/gi;
  while ((m = en1.exec(clause))) push(CP_EN_MONTHS[m[1].toLowerCase()], m[2]);
  const en2 = /\b(\d{1,2})(?:st|nd|rd|th)?\s+(January|February|March|April|May|June|July|August|September|October|November|December)\b/gi;
  while ((m = en2.exec(clause))) push(CP_EN_MONTHS[m[2].toLowerCase()], m[1]);
  return values;
}

function cpParseDeadline(text, cycleYear) {
  text = String(text || '');
  const negative = /(开放|open(?:s|ing)?|发布|公布|available|预计|expected|满\s*18|年中开放|开始接受)/i;
  const positive = /(截止|deadline|due|submit|submission|递交|提交|申请日期|申请期限|截至|最晚|通常至|须在.*前)/i;
  const candidates = [];
  text.split(/[。；;\n]+/).map(x => x.trim()).filter(Boolean).forEach(clause => {
    if (negative.test(clause) && !positive.test(clause)) return;
    const score = positive.test(clause) ? 3 : /\b20\d{2}[-/.]\d{1,2}[-/.]\d{1,2}\b/.test(clause) ? 2 : 1;
    cpDeadlineCandidatesFromClause(clause, cycleYear).forEach(date => candidates.push({ date, score }));
  });
  if (!candidates.length) return null;
  candidates.sort((a, b) => b.score - a.score || a.date - b.date);
  return candidates[0];
}

// 国家标签 / 排序统一从 data/school_priority.json 的 _meta.country_labels /
// _meta.country_order 读取（跟院校库 schools.js 共用同一份，避免多处维护出现
// 用词/顺序不一致）；这里用 name_full（"中国香港"/"中国澳门"/"澳大利亚"）
// 保持本页原有措辞不变，只是数据来源换成 JSON。排序改用院校库同款顺序
// （美/英/澳/新西兰/港/澳/日/韩/加，加拿大排到最后），跟原来的
// 美/英/加/澳/新西兰/港/澳/日/韩 相比顺序上有细微调整。
function cpCountryLabel(code) {
  const c = (DATA.school_priority && DATA.school_priority._meta && DATA.school_priority._meta.country_labels || {})[code];
  return (c && c.name_full) || code;
}
function cpCountryOrder() {
  return (DATA.school_priority && DATA.school_priority._meta && DATA.school_priority._meta.country_order) || [];
}
// 最多可选职业目标数，跟 CareerCart._max 共用同一份 data/career_planning.json
// 的 principles.maxCareerTargets，避免两处各写一个「3」。
function cpMaxTargets() {
  return (DATA.career_planning && DATA.career_planning.principles && DATA.career_planning.principles.maxCareerTargets) || 3;
}
// 各国申请截止日期兜底（真实截止日期解析失败时用），来自
// data/career_planning.json 的 deadlines.fallback_by_country，改日期只需要改 json。
function cpFallbackDeadline(country, cycleYear) {
  const ddl = (DATA.career_planning && DATA.career_planning.deadlines && DATA.career_planning.deadlines.fallback_by_country) || {};
  const [m, d] = ddl[country] || [12, 1];
  return new Date(m >= 8 ? cycleYear - 1 : cycleYear, m - 1, d);
}
function cpFormatDate(d) {
  return d ? d.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' }) : '';
}
function cpAddDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function cpMonthStart(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function cpCycleYear(s) { return 2000 + (parseInt(s.cohort, 10) || 27); }

/* ── 作品集/材料要求归类（移植并简化自归档项目 requirementKind） ──
   归档版本按「单条要求」分类；当前 programs.json 的 portfolio_note
   是整段自由文本，这里对整段文本做一次整体归类，用于跨院校归并、
   去重展示，而不是逐条拆分。
   规则本身（正则、标题、优先级、天数偏移）来自 data/career_planning.json
   的 requirementRules，跟 rolePools 一样「正则存字符串，用时编译」；改判断
   规则或文案只需要编辑这份 json。 */
let _cpReqRulesCache = null;
function cpRequirementRules() {
  if (_cpReqRulesCache) return _cpReqRulesCache;
  const cfg = (DATA.career_planning && DATA.career_planning.requirementRules) || { rules: [], default: { kind: 'materials-integration', title: '已有材料整合与规格适配', priority: 9, offsetDays: -45 } };
  _cpReqRulesCache = {
    promptSpecific: new RegExp(cfg.promptSpecificMatch || '(?!)', 'i'),
    rules: (cfg.rules || []).map(r => ({
      ...r,
      re: new RegExp(r.match, 'i'),
      excludeRe: r.excludeMatch ? new RegExp(r.excludeMatch, 'i') : null,
    })),
    default: cfg.default,
  };
  return _cpReqRulesCache;
}
function cpPromptSpecific(text) {
  return cpRequirementRules().promptSpecific.test(String(text || ''));
}

function cpRequirementKind(text) {
  const lower = String(text || '').toLowerCase();
  const specific = cpPromptSpecific(text);
  const cfg = cpRequirementRules();
  for (const r of cfg.rules) {
    if (!r.re.test(lower)) continue;
    if (r.excludeRe && r.excludeRe.test(lower)) continue;
    const v = specific && r.whenSpecific ? r.whenSpecific : r;
    return { kind: v.kind, title: v.title, priority: v.priority };
  }
  const d = cfg.default;
  return { kind: d.kind, title: d.title, priority: d.priority };
}

function cpOutputOffset(kind) {
  const cfg = cpRequirementRules();
  for (const r of cfg.rules) {
    if (r.kind === kind) return r.offsetDays;
    if (r.whenSpecific && r.whenSpecific.kind === kind) return r.whenSpecific.offsetDays;
  }
  return cfg.default.offsetDays;
}

/* ── 专业方向分类（移植自归档项目 programTrack / TRACK_META） ──
   方向名称/简介与分类规则（正则、字段、排除条件）来自
   data/career_planning.json 的 programTracks / programTrackRules，
   规则按顺序命中、第一条命中即返回，都不命中用 default 兜底。 */
function cpTrackMeta() { return (DATA.career_planning && DATA.career_planning.programTracks) || {}; }
let _cpTrackRulesCache = null;
function cpProgramTrackRules() {
  if (_cpTrackRulesCache) return _cpTrackRulesCache;
  const cfg = (DATA.career_planning && DATA.career_planning.programTrackRules) || { rules: [], default: 'film-production' };
  _cpTrackRulesCache = {
    rules: (cfg.rules || []).map(r => ({ ...r, re: new RegExp(r.match), excludeRe: r.excludeMatch ? new RegExp(r.excludeMatch) : null })),
    default: cfg.default || 'film-production',
  };
  return _cpTrackRulesCache;
}
function cpProgramTrack(p) {
  const name = String(p.program_name_en || p.program_name_zh || '').toLowerCase();
  const detail = [p.degree_type, p.background_note, p.portfolio_note].filter(Boolean).join(' ').toLowerCase();
  const fields = { name, text: name + ' ' + detail };
  const cfg = cpProgramTrackRules();
  for (const r of cfg.rules) {
    if (!r.re.test(fields[r.field])) continue;
    if (r.excludeRe && r.excludeRe.test(fields[r.excludeField || r.field])) continue;
    return r.track;
  }
  return cfg.default;
}

/* ── 职业资源匹配（移植自归档项目 resourceLibrary / careerResources / careerConfig，
      落在站内已迁移但此前未接入UI的 data/internship_resources.json + data/career_planning.json 上） ── */
function cpResourceLibrary() {
  const lib = DATA.internship_resources || {};
  const resources = lib.resources || {};
  const roleMap = lib.roleMap || {};
  return {
    get: id => resources[id] || null,
    forRole: roleId => (roleMap[String(roleId)] || []).map(id => resources[id]).filter(Boolean),
    all: () => Object.values(resources),
    aiFallback: (lib.aiFallback || []).map(id => resources[id]).filter(Boolean),
  };
}
function cpUniqueResources(list) {
  const seen = new Set();
  return list.filter(r => r && r.id && !seen.has(r.id) && seen.add(r.id));
}
function cpResourceKinds(r) { return Array.isArray(r && r.experienceKinds) ? r.experienceKinds : []; }

function cpCareerResources(targets) {
  const lib = cpResourceLibrary();
  const roleIds = targets.map(t => t.roleId).filter(id => id != null);
  const mapped = cpUniqueResources(roleIds.flatMap(id => lib.forRole(id) || []));
  const internship = mapped.filter(r => cpResourceKinds(r).includes('internship'));
  let related = internship.filter(r => !r.isAi && !r.isTopPlatform).slice(0, 3);
  if (related.length < 2) related = cpUniqueResources(related.concat(internship.filter(r => !r.isAi)).concat(internship)).slice(0, 3);
  let top = internship.filter(r => r.isTopPlatform && !related.some(x => x.id === r.id)).slice(0, 3);
  if (!top.length) top = lib.all().filter(r => r.isTopPlatform && cpResourceKinds(r).includes('internship')).slice(0, 3);
  const fallbackAi = lib.aiFallback || [];
  let ai = cpUniqueResources(mapped.filter(r => r.isAi).concat(fallbackAi))
    .filter(r => !related.some(x => x.id === r.id) && !top.some(x => x.id === r.id)).slice(0, 3);
  if (!ai.length) ai = cpUniqueResources(fallbackAi).filter(r => !related.some(x => x.id === r.id) && !top.some(x => x.id === r.id)).slice(0, 3);
  return { related, top, ai, sourceCount: lib.all().length };
}
function cpResourceNames(items) {
  if (!items || !items.length) return '当前SFK资源库暂无完全匹配候选，需由顾问补充或选择相邻资源。';
  return items.map(x => x.name).join(' / ');
}
function cpAiToolsForTarget(mainTarget) {
  const data = DATA.career_planning || {};
  const title = (mainTarget && mainTarget.directionZh) || '';
  let pool = null;
  (data.rolePools || []).some(x => { try { if (new RegExp(x.match).test(title)) { pool = x; return true; } } catch (e) { /* 忽略非法正则 */ } return false; });
  pool = pool || data.fallback || {};
  return pool.tools || [];
}

/* ── 课程产品与行业课程推荐（移植自旧版独立「我的规划」页面 plan.js 的
      _courseHtml：该页面已下线，但它推荐的两类内容此前从未被「职业规划」
      报告覆盖，属于真实的功能缺口，这里原样补齐——
        1) 旗舰长线课程产品（window.PRODUCTS，按规划类型推荐，点击打开
           站内已有的 CourseOverlay 弹层，与「课程产品」页共用同一份数据）
        2) 站内 115 条行业课程库（data/courses_industry.json），按职业目标
           关键词命中，命中不到则退回按产业方向匹配 ── */
function cpFlagshipProducts(mode) {
  const byMode = (DATA.career_planning && DATA.career_planning.flagshipProductsByMode) || {};
  const ids = byMode[mode] || ['changemakers'];
  return ids.filter(id => window.PRODUCTS && window.PRODUCTS[id]).map(id => ({ id, p: window.PRODUCTS[id] }));
}
function cpIndustryCourseMatches(targets) {
  // 注：courses_industry.json 的 suitable_for 字段全库 115 条都是同一个常量
  // "影视传媒方向"，并非按方向/岗位区分的真实筛选字段（旧版 plan.js 里用它兜底
  // 匹配也只是巧合地"默认值等于默认值"而已，并非有效过滤）；因此这里命中不到
  // 关键词时直接回退为库内前4条，而不是依赖这个不承担实际筛选作用的字段。
  const roleText = (targets || []).map(t => t.directionZh).join(' ');
  const kws = roleText ? roleText.split(/[\s/／、]+/).filter(x => x.length > 1) : [];
  const all = DATA.courses_industry || [];
  if (!kws.length) return all.slice(0, 4);
  const hit = all.filter(c => {
    const t = `${c.company || ''} ${c.role_or_course || ''} ${c.description || ''}`;
    return kws.some(k => t.includes(k));
  });
  return (hit.length ? hit : all).slice(0, 4);
}
function cpCourseProductsHtml(mode, targets, tracks) {
  const products = cpFlagshipProducts(mode);
  const productHtml = products.map(({ id, p }) => {
    const m = p.meta || {};
    return `
      <article class="cp-resource-block">
        <small>SFK 旗舰课程产品</small>
        <b>${cpEsc(m.titleCn || id)}</b>
        <p style="font-size:var(--text-xs);color:var(--color-text-muted);line-height:1.6;margin:6px 0 0">${cpEsc(m.desc || '')}</p>
        <button type="button" class="pl-btn" style="margin-top:var(--space-3)" onclick="CourseOverlay.open('${id}')">查看课程产品 →</button>
      </article>`;
  }).join('');
  const courses = cpIndustryCourseMatches(targets);
  const courseHtml = courses.length ? `<div class="pl-tasks" style="margin-top:var(--space-4)">${courses.map(c => `
    <div class="pl-task" style="grid-template-columns:1fr">
      <div>
        <div class="pl-task__title">${cpEsc(c.role_or_course || c.company)}</div>
        <div class="pl-task__meta">${cpEsc([c.program_type, c.location, c.level, c.enrollment_status].filter(Boolean).join(' · '))}</div>
      </div>
    </div>`).join('')}</div>` : '';
  return `<div class="cp-resource-grid">${productHtml}</div>${courseHtml}`;
}

function cpCareerTimelineEvents(targets, cycleYear, dual) {
  const resources = cpCareerResources(targets);
  const tools = cpAiToolsForTarget(targets[0]);
  const now = new Date();
  const start = cpMonthStart(now);
  const dates = dual
    ? [new Date(cycleYear - 1, 5, 1), new Date(cycleYear, 2, 1), new Date(cycleYear, 7, 1), new Date(cycleYear + 1, 0, 1), new Date(cycleYear + 1, 6, 1), new Date(cycleYear + 2, 7, 1)]
    : [start, cpAddDays(start, 90), cpAddDays(start, 180), cpAddDays(start, 270), cpAddDays(start, 365), cpAddDays(start, 450)];
  const safe = d => d < start ? start : d;
  const targetTitle = (targets[0] && targets[0].directionZh) || '目标岗位';
  return [
    { date: safe(dates[0]), type: 'career', title: 'AI工具基础与岗位工作流', detail: (tools.join('；') || '生成式AI基础、AI影像工作流、版权与合规、人工创作判断') + '。学习必须围绕"' + targetTitle + '"的真实交付，而不是只学软件。' },
    { date: safe(dates[1]), type: 'career', title: '第1段实习 · 岗位高度相关', detail: cpResourceNames(resources.related) + '。候选来自SFK现有资源库，需由顾问确认当期名额与具体职责。' },
    { date: safe(dates[2]), type: 'career', title: '第3段经历 · AI商业项目／AI影视实习', detail: cpResourceNames(resources.ai) + '。形成可复盘的AI工作流、人工判断和交付成果。' },
    { date: safe(dates[3]), type: 'career', title: '第2段实习 · 头部平台／高质量公司', detail: cpResourceNames(resources.top) + '。这一段优先从资源库中标记为头部平台或高质量公司的候选中选择。' },
    { date: safe(dates[4]), type: 'career', title: '商业作品集整合', detail: '把两段实习与AI商业项目整理为：项目背景、目标、个人职责、过程、解决的问题、最终成果。' },
    { date: safe(dates[5]), type: 'career', title: '校招与实习转正窗口', detail: '提前完成岗位版简历、商业作品集、项目讲述和目标公司池；重点关注秋招提前批、正式批与实习转正。' },
  ];
}

/* ── 学校优先级排序（移植自归档项目 schoolPrioritySelection，用 programs.json 已有的
      industry_rank 代替归档的 school.industryRank） ── */
function cpSchoolPrioritySelection(picks, limit = 8) {
  const groups = new Map();
  picks.forEach(({ p }, index) => {
    const key = p.school_en || p.school_zh;
    const rank = Number(p.industry_rank) > 0 ? Number(p.industry_rank) : 9999;
    if (!groups.has(key)) groups.set(key, { key, schoolZh: p.school_zh, schoolEn: p.school_en, programs: [], firstIndex: index, rank });
    const g = groups.get(key);
    g.programs.push(p);
    g.rank = Math.min(g.rank, rank);
  });
  const ordered = [...groups.values()].sort((a, b) => a.rank - b.rank || a.firstIndex - b.firstIndex)
    .map((g, i) => ({ ...g, priority: i + 1, rankLabel: g.rank < 9999 ? '行业排名权重 #' + g.rank : '暂无排名权重' }));
  const detailed = ordered.slice(0, limit), candidates = ordered.slice(limit);
  return { detailed, candidates, detailedPrograms: detailed.flatMap(g => g.programs), candidatePrograms: candidates.flatMap(g => g.programs) };
}

/* ── 作品集/材料产出汇总（移植自归档项目 aggregatePortfolioPlan / outputSummaryHtml） ── */
function cpAggregatePortfolio(picks) {
  const groups = new Map();
  picks.forEach(({ p }) => {
    if (!p.portfolio_note) return;
    const kind = cpRequirementKind(p.portfolio_note);
    if (!groups.has(kind.kind)) groups.set(kind.kind, { ...kind, programs: [], notes: new Set() });
    const g = groups.get(kind.kind);
    g.programs.push(p);
    g.notes.add(p.portfolio_note.length > 200 ? p.portfolio_note.slice(0, 199) + '…' : p.portfolio_note);
  });
  const outputs = [...groups.values()].sort((a, b) => a.priority - b.priority || b.programs.length - a.programs.length);
  const filmCount = outputs.filter(o => ['main-film', 'prompt-film'].includes(o.kind)).length;
  const writingCount = outputs.filter(o => ['creative-writing', 'prompt-writing', 'academic-paper'].includes(o.kind)).length;
  const supportingCount = outputs.filter(o => !['main-film', 'prompt-film', 'creative-writing', 'prompt-writing', 'academic-paper'].includes(o.kind)).length;
  return { outputs, filmCount, writingCount, supportingCount };
}
function cpOutputSummaryHtml(plan) {
  if (!plan.outputs.length) return '<div class="pl-empty">当前所选专业尚未提取到可执行作品任务，需要专项核实。</div>';
  const stat = (k, v, d) => `<article><small>${k}</small><b>${v}</b><span>${d}</span></article>`;
  const statsHtml = `<div class="cp-output-stats">${stat('影像作品', plan.filmCount + ' 部／组', '主短片与独立命题影像')}${stat('写作产出', plan.writingCount + ' 组', '可复用母版与独立命题')}${stat('补充材料', plan.supportingCount + ' 组', '视频、视觉、声音与作品清单')}</div>`;
  const cardsHtml = plan.outputs.map((o, i) => {
    const schools = [...new Set(o.programs.map(p => p.school_zh))];
    return `
      <article class="cp-output-card">
        <div class="cp-output-index">${String(i + 1).padStart(2, '0')}</div>
        <div class="cp-output-main">
          <div class="cp-output-head"><h4>${o.title}</h4><span class="cd-chip">${o.programs.length} 所涉及</span></div>
          <p class="cp-output-map"><strong>对应院校：</strong>${schools.slice(0, 5).join('、')}${schools.length > 5 ? ' 等' + schools.length + '所' : ''}</p>
          <ul>${[...o.notes].slice(0, 2).map(n => `<li>${n}</li>`).join('')}</ul>
        </div>
      </article>`;
  }).join('');
  return statsHtml + `<div class="cp-output-list">${cardsHtml}</div>`;
}
function cpOutputsForKinds(plan, kinds) {
  const all = plan.outputs.filter(o => kinds.includes(o.kind));
  return all.length ? all.map(o => o.title).join('；') : '根据当季要求补充';
}
function cpMappedProgramsForKinds(plan, kinds) {
  const all = plan.outputs.filter(o => kinds.includes(o.kind));
  const schools = [...new Set(all.flatMap(o => o.programs.map(p => p.school_zh)))];
  if (!all.length) return '要求形式：阶段基础训练；对应：全部所选专业';
  return '要求形式：' + all.map(o => o.title).join('、') + '；对应：' + schools.slice(0, 5).join('、') + (schools.length > 5 ? ' 等' + schools.length + '所院校' : '');
}

/* ── 专业方向分布（移植自归档项目 programTrackSummary / programTrackHtml） ── */
function cpProgramTrackSummary(picks) {
  const groups = new Map();
  picks.forEach(({ p }) => {
    const key = cpProgramTrack(p);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  });
  return [...groups.entries()].map(([key, items]) => ({ key, meta: cpTrackMeta()[key], items })).sort((a, b) => b.items.length - a.items.length);
}
function cpProgramTrackHtml(tracks) {
  if (!tracks.length) return '<div class="pl-empty">暂无已选专业。</div>';
  return `<div class="cp-track-grid">${tracks.map(t => `
    <article class="cp-track-card">
      <div class="cp-track-head"><b>${t.meta.label}</b><em>${t.items.length}个专业</em></div>
      <p>${t.meta.copy}</p>
      <details><summary>查看专业</summary><ul>${t.items.map(p => `<li>${p.school_zh} · ${p.program_name_zh || p.program_name_en}</li>`).join('')}</ul></details>
    </article>`).join('')}</div>`;
}

/* ── 申请要求总表（移植自归档项目 applicationRequirementTableHtml） ── */
function cpAcademicsSummary(p) {
  return [p.gpa_requirement, p.language_scores, p.background_note].filter(Boolean).join('；') || '请按当季专业页面核对学术与通用材料';
}
function cpApplicationRequirementTableHtml(priority, deadlineByProgId) {
  const rows = priority.detailed.flatMap(group => group.programs.map(p => {
    const d = deadlineByProgId.get(p.id);
    return `<tr>
      <td><em>重点 ${group.priority} · ${group.rankLabel}</em><b>${p.school_zh}</b><span>${p.program_name_zh || p.program_name_en}</span></td>
      <td><strong>${d && d.unavailable ? '当前不可申请' : (d && d.date ? cpFormatDate(d.date) + (d.estimated ? ' · 暂估' : '') : '待核实')}</strong><small>${(d && d.raw) || p.deadline || '当季DDL尚未公布'}</small></td>
      <td>${cpAcademicsSummary(p)}</td>
      <td>${p.portfolio_note ? '<p>' + p.portfolio_note + '</p>' : '<span>当前未提取到新增作品要求。</span>'}</td>
    </tr>`;
  })).join('');
  const candidateHtml = priority.candidates.length ? `
    <div class="cp-candidate-note"><b>其余 ${priority.candidates.length} 所保留为候选院校</b>
      <ol>${priority.candidates.map(g => `<li><span>${g.schoolZh}</span><small>${g.programs.length}个专业 · ${g.rankLabel}</small></li>`).join('')}</ol>
    </div>` : '';
  return `<div class="cp-table-note"><b>重点详写 ${priority.detailed.length} 所／共选择 ${priority.detailed.length + priority.candidates.length} 所</b><span>按院校行业排名权重排序；DDL仍覆盖全部已选院校。</span></div>
    <div class="cp-table-wrap"><table class="cp-req-table"><thead><tr><th>优先级、学校与具体专业</th><th>DDL</th><th>学术与通用材料</th><th>作品集要求</th></tr></thead><tbody>${rows}</tbody></table></div>
    ${candidateHtml}`;
}

/* ── 阶段执行路线图（移植自归档项目 stageRoadmap / stageRoadmapHtml） ── */
function cpStageRoadmap(plan, tracks, deadlines, cycleYear) {
  const now = new Date();
  const start = cpMonthStart(now);
  const dated = deadlines.filter(d => d.date);
  const first = dated.length ? dated[0].date : cpFallbackDeadline('US', cycleYear);
  const safe = d => d < start ? start : d;
  const hasFilm = plan.outputs.some(o => o.kind === 'main-film');
  const hasPrompt = plan.outputs.some(o => ['prompt-film', 'prompt-writing', 'video-intro'].includes(o.kind));
  const hasAcademic = plan.outputs.some(o => o.kind === 'academic-paper');
  return [
    { date: start, phase: '01 · 基础与诊断', learning: '电影语言、故事结构、视听分析；传媒／研究方向补调研与论证基础。', output: '基础练习、能力诊断、第一版选题池', maps: '要求形式：基础练习与选题；对应：' + (tracks.map(t => t.meta.label).join('、') || '所选专业') + '的共同底层能力' },
    { date: safe(cpAddDays(first, -180)), phase: '02 · 母版开发', learning: '用写作训练理解人物、故事和项目逻辑；剧本、故事大纲、Treatment与开放写作进入同一套可改写素材库。', output: cpOutputsForKinds(plan, ['main-film', 'creative-writing', 'academic-paper']), maps: cpMappedProgramsForKinds(plan, ['main-film', 'creative-writing', 'academic-paper']) },
    { date: safe(cpAddDays(first, -135)), phase: '03 · 核心制作', learning: hasFilm ? '导演、拍摄、剪辑、声音与团队实践。' : '研究方法、材料分析与长篇写作。', output: hasFilm ? '主短片完整初版与不同时长剪辑版本' : (hasAcademic ? '学术论文完整初稿' : '主要作品完整初稿'), maps: cpMappedProgramsForKinds(plan, ['main-film', 'academic-paper', 'visual-material', 'sound-material']) },
    { date: safe(cpAddDays(first, -90)), phase: '04 · 独立命题核对', learning: '只有学校给出具体场景、素材、主题、关键词或限制条件时才单独创作；不同学校的特定命题分别完成。', output: hasPrompt ? cpOutputsForKinds(plan, ['prompt-film', 'prompt-writing', 'video-intro']) : '无新增独立命题；仅保留当季要求核对节点', maps: hasPrompt ? cpMappedProgramsForKinds(plan, ['prompt-film', 'prompt-writing', 'video-intro']) : '当前所选专业未提取到独立命题；如当季更新，再单独加入' },
    { date: safe(cpAddDays(first, -50)), phase: '05 · 拆分与包装', learning: '按学校时长、页数、格式和个人职责说明拆分母版，不重新从零创作。', output: cpOutputsForKinds(plan, ['visual-material', 'project-list', 'special-material', 'materials-integration']) + '；逐校格式版本', maps: cpMappedProgramsForKinds(plan, ['visual-material', 'project-list', 'special-material', 'materials-integration']) },
    { date: safe(cpAddDays(first, -18)), phase: '06 · 交付与表达', learning: '上传测试、作品讲述、面试与复盘。', output: '最终文件、字幕与链接；仅在院校明确要求时加入自我介绍视频', maps: '要求形式：最终文件、链接及已确认的口述／视频表达；对应：最早DDL及之后各校提交与面试' },
  ];
}
function cpStageRoadmapHtml(stages) {
  if (!stages.length) return '<div class="pl-empty">暂无可排期的院校专业。</div>';
  return `<div class="cp-stage-table">
    <div class="cp-stage-row head"><span>时间／阶段</span><span>本阶段学习任务</span><span>必须形成的产出</span><span>对应院校要求</span></div>
    ${stages.map(s => `<div class="cp-stage-row"><span><b>${s.date.getFullYear()}年${s.date.getMonth() + 1}月</b><em>${s.phase}</em></span><p>${s.learning}</p><p>${s.output}</p><p>${s.maps}</p></div>`).join('')}
  </div>`;
}

/* ── 学习/实践/背景提升候选（移植自归档项目 learningResourceCandidates / learningResourcesHtml /
      learningTermOptions；落在站内已迁移但此前未接入UI的 data/courses_academic.json 上，
      字段与归档 SFK_LEARNING_RESOURCES 完全对应：suitable_for="track1｜track2" → 方向匹配，
      season="winter" / "winter／spring／autumn" → 可安排学期） ── */
function cpLearningCourses() {
  return (DATA.courses_academic || []).map((c, i) => ({
    ...c,
    id: 'course-' + i,
    trackKeys: String(c.suitable_for || '').split(/[｜|]/).map(x => x.trim()).filter(Boolean),
    seasons: String(c.season || '').split(/[／/,、]+/).map(x => x.trim()).filter(Boolean),
  }));
}
function cpLearningResourceCandidates(trackKeys) {
  const trackSet = new Set(trackKeys);
  return cpLearningCourses()
    .map(r => ({ ...r, recommended: !r.trackKeys.length || !trackSet.size || r.trackKeys.some(k => trackSet.has(k)) }))
    .sort((a, b) => Number(b.recommended) - Number(a.recommended));
}
function cpSeasons() { return (DATA.career_planning && DATA.career_planning.seasons) || {}; }
function cpLearningTermOptions(resource, cycleYear) {
  const now = new Date();
  const floor = cpMonthStart(now);
  const seasons = cpSeasons();
  function collect(maxYear, extend) {
    const options = [];
    for (let year = now.getFullYear(); year <= maxYear; year++) {
      (resource.seasons || []).forEach(season => {
        const month = seasons[season] && seasons[season].month;
        if (!month) return;
        const date = new Date(year, month - 1, 1);
        if (date < floor) return;
        if (!extend && date > new Date(cycleYear, 6, 31)) return;
        options.push({ value: year + '-' + String(month).padStart(2, '0'), label: year + '年' + ((seasons[season] && seasons[season].label) || season) + (extend ? '（下一批次）' : ''), date });
      });
    }
    return options.sort((a, b) => a.date - b.date);
  }
  const options = collect(cycleYear, false);
  if (options.length) return options;
  /* 兜底：若所选申请季本身的窗口已经过期（例如系统当前日期已晚于该批次的正常
     截止时间，如站点数据里较早的批次未及时更新），原逻辑会让每一门课程都返回
     空的可选学期列表，导致下拉与"加入个人时间线"按钮整体失效、选课永远进不了
     时间线。这里在原窗口为空时，向后多找几年最近的一个学期兜底，保证功能始终
     可用，而不是静默失败。 */
  for (let extra = 1; extra <= 3; extra++) {
    const extended = collect(cycleYear + extra, true);
    if (extended.length) return extended;
  }
  return options;
}
function cpSelectedLearningEvents(state, coursesList) {
  return (state.learningSelections || []).map(sel => {
    const resource = coursesList.find(c => c.id === sel.resourceId);
    const parts = String(sel.month || '').split('-').map(Number);
    if (!resource || parts.length < 2 || !parts[0] || !parts[1]) return null;
    return {
      date: new Date(parts[0], parts[1] - 1, 1), type: 'learning',
      title: resource.role_or_course,
      detail: '已加入个人时间线 · ' + (resource.program_type || '学习实践') + '；预期产出：' + (resource.outcomes || '按项目要求形成阶段成果') + '。' + (resource.description || ''),
    };
  }).filter(Boolean);
}

/* ── 按月关键节点（移植自归档项目 portfolioMilestones / aggregatedRequirementEvents /
      deadlineTimelineEvents / timelineData / monthlyTimelineHtml） ── */
function cpPortfolioMilestones(plan, deadlines) {
  const now = new Date();
  const start = cpMonthStart(now);
  const events = [];
  events.push({ date: start, type: 'portfolio', title: '基础能力诊断与训练开始', detail: '根据所选专业类别补电影语言、故事写作、调研、视觉表达或技术基础，并完成一版短练习。' });
  if (plan.outputs.some(o => o.kind === 'main-film')) events.push({ date: start, type: 'portfolio', title: '主短片／主要影像作品启动', detail: '先完成故事、剧本与视觉方案，再进入拍摄；同一主作品按不同学校时长导出版本。' });
  if (plan.outputs.some(o => ['creative-writing', 'academic-paper'].includes(o.kind))) events.push({ date: start, type: 'portfolio', title: '可复用写作母版启动', detail: '开放写作、故事大纲或学术论文不等待当季命题，先完成可持续修改的母版。' });
  const dated = deadlines.filter(d => d.date);
  if (dated.length) {
    const first = dated[0].date;
    events.push({ date: cpAddDays(first, -56), type: 'portfolio', title: '所有作品进入完整版本', detail: '最早DDL前约8周锁定主作品与写作母版，停止新增大体量项目。' });
    events.push({ date: cpAddDays(first, -35), type: 'portfolio', title: '逐校格式拆分与定稿', detail: '按页数、时长、字幕、文件格式与学校独立命题完成最终版本。' });
    events.push({ date: cpAddDays(first, -14), type: 'portfolio', title: '上传与播放测试', detail: '检查文件名、时长、字幕、压缩、链接、个人职责和上传可用性。' });
  }
  return events;
}
function cpAggregatedRequirementEvents(plan, deadlines, cycleYear) {
  const now = new Date();
  const start = cpMonthStart(now);
  const dated = deadlines.filter(d => d.date);
  const earliest = dated.length ? dated[0].date : cpFallbackDeadline('US', cycleYear);
  return plan.outputs.map(o => {
    let date = cpAddDays(earliest, cpOutputOffset(o.kind));
    if (date < start) date = start;
    const schools = [...new Set(o.programs.map(p => p.school_zh))];
    return { date, type: 'requirement', title: o.title + '启动', detail: (o.priority <= 3 ? '单独完成，主要对应：' : '建立可复用母版，覆盖：') + schools.slice(0, 3).join('、') + (schools.length > 3 ? ' 等' : '') };
  });
}
function cpDeadlineTimelineEvents(deadlines) {
  const groups = new Map();
  deadlines.filter(d => d.date && !d.unavailable).forEach(d => {
    const key = d.date.getFullYear() + '-' + d.date.getMonth() + '-' + d.date.getDate();
    if (!groups.has(key)) groups.set(key, { date: d.date, schools: new Set(), estimated: false });
    const g = groups.get(key);
    g.schools.add(d.p.school_zh);
    g.estimated = g.estimated || d.estimated;
  });
  return [...groups.values()].sort((a, b) => a.date - b.date).map(g => ({ date: g.date, type: 'hard', title: (g.date.getMonth() + 1) + '.' + g.date.getDate() + ' DDL', detail: '学校：' + [...g.schools].join('、') + (g.estimated ? '（日期暂估）' : '') }));
}
function cpTimelineData(plan, deadlines, cycleYear, extraEvents) {
  let events = [];
  if (plan.outputs.length || deadlines.length) {
    events = events.concat(cpPortfolioMilestones(plan, deadlines));
    events = events.concat(cpAggregatedRequirementEvents(plan, deadlines, cycleYear));
    events = events.concat(cpDeadlineTimelineEvents(deadlines));
  }
  if (extraEvents && extraEvents.length) events = events.concat(extraEvents);
  const today = cpMonthStart(new Date());
  events = events.filter(e => e.date && !isNaN(e.date)).map(e => ({ ...e, overdue: cpMonthStart(e.date) < today })).sort((a, b) => a.date - b.date);
  const groups = new Map();
  events.forEach(e => {
    const k = e.date.getFullYear() + '-' + String(e.date.getMonth() + 1).padStart(2, '0');
    if (!groups.has(k)) groups.set(k, { date: new Date(e.date.getFullYear(), e.date.getMonth(), 1), items: [] });
    const g = groups.get(k);
    if (!g.items.some(x => x.title === e.title && x.detail === e.detail)) g.items.push(e);
  });
  return [...groups.values()];
}
/* 按月关键节点：改为纵向时间轴 UI（左侧圆点+连线 + 右侧月度卡片），
   对齐归档项目 monthlyTimelineHtml 呈现的信息但视觉上更接近真实时间轴。 */
function cpMonthlyTimelineHtml(groups) {
  if (!groups.length) return '<div class="pl-empty">暂无按月节点，请先完成上方的目标或专业选择。</div>';
  const typeLabel = { hard: '硬性 DDL', career: '职业节点', requirement: '产出任务', portfolio: '作品节点', learning: '已选课程／实践' };
  return `<div class="cp-timeline">${groups.map(g => `
    <div class="cp-month">
      <div class="cp-month-time">${g.date.getFullYear()}年${g.date.getMonth() + 1}月</div>
      <div class="cp-month-body">${g.items.map(e => `
        <div class="cp-month-item">
          <h4><span class="cp-task-type cp-task-type--${e.type}">${typeLabel[e.type] || '作品节点'}</span>${e.overdue ? '<span class="cp-overdue">已到期／需复核</span>' : ''}${e.title}</h4>
          <p>${e.detail}</p>
        </div>`).join('')}</div>
    </div>`).join('')}</div>`;
}

/* ── 规划价值 + 鼓励语（移植自归档项目 baselineValueProposition / planEncouragement）──
   归档版本的可替换文案模板来自 window.SFK_VALUE_PROPOSITIONS（站内无此数据文件），
   但归档代码里实际展示的每一句文案都是由 replace() 用真实计算出的变量（方向分布、
   职业目标、重点/候选院校数量等）拼出来的固定模板句，并非取自那份缺失的配置本身；
   这里把这些模板句原样复刻，全部用当前真实选择计算，不引入任何编造数据。
   planEncouragement 三段鼓励语现由 data/career_planning.json 的 planEncouragement 提供。 ── */
function cpPlanEncouragement(mode) {
  const cfg = (DATA.career_planning && DATA.career_planning.planEncouragement) || {};
  return cfg[mode] || cfg.career || '';
}
function cpValueProposition(state, r) {
  const name = state.studentName || '你';
  const trackText = r.tracks.slice(0, 2).map(t => t.meta.label).join('与') || '影视传媒';
  const roleText = r.targets.slice(0, 3).map(t => t.directionZh).join('、') || '后续发展方向';
  const countryText = state.countries.length ? state.countries.map(c => cpCountryLabel(c)).join('与') : '当前申请地区';
  const evidence = '当前已确认的兴趣、经历与能力证据';
  const programCount = r.selectedPrograms.length;
  const detailedCount = (r.priority && r.priority.detailed.length) || 0;
  const candidateCount = (r.priority && r.priority.candidates.length) || 0;
  const modeLabel = r.mode === 'study' ? '留学规划' : r.mode === 'career' ? '职业规划' : '留学+就业双规划';

  const sections = [];
  if (r.mode !== 'career') {
    sections.push({
      title: '留学申请定位',
      items: [
        { label: '留学定位', text: `结合${cpEsc(name)}当前的"${evidence}"，以${trackText}为申请主线，在${countryText}的${programCount}个具体专业中优先保留能放大这些优势、并支持${roleText}发展的选校与作品组合。` },
        { label: '优势放大', text: `优先把"${evidence}"转化为选题、人物表达与作品职责证据，让优势在${trackText}申请中可见、可验证。` },
        { label: '申请策略', text: `以${detailedCount}所重点院校为正文主线，按排名权重排序并合并可复用作品母版；其余${candidateCount}所保留为候选与DDL提醒。` },
      ],
    });
  }
  if (r.mode !== 'study') {
    sections.push({
      title: '职业发展定位',
      items: [
        { label: '职业定位', text: `以${roleText}为主、次与探索方向，把共同能力沉淀为可跨岗位复用的职业资产。` },
        { label: '求职策略', text: '用岗位相关实习、头部平台经历与AI商业项目完成三段验证，并围绕商业作品集、岗位表达和校招节点倒推行动。' },
      ],
    });
  }
  const guaranteeLabel = r.mode === 'study-career' ? '留学就业衔接' : '规划保障';
  const guaranteeText = r.mode === 'study-career'
    ? '用一条时间线衔接申请作品、在读实践、商业作品集与校招；不构成录取、实习或就业结果承诺。'
    : '保障仅指规划过程、资源匹配与执行衔接，不构成录取、实习或就业结果承诺。';
  sections.push({
    title: '规划保障机制',
    items: [
      { label: '精准定位', text: r.mode === 'career' ? '以三个职业目标校准行动优先级。' : r.mode === 'study' ? `以${countryText}的具体专业要求校准申请组合。` : `同时校准${trackText}申请方向与${roleText}职业方向。` },
      { label: '有效落地', text: '用阶段任务、月度里程碑、顾问确认和DDL倒推保证规划持续推进。' },
      { label: '资源链接', text: '只从已核实的SFK课程、大师课、实践、实习和AI商业项目中匹配资源；没有匹配时明确资源缺口。' },
      { label: guaranteeLabel, text: guaranteeText },
    ],
  });

  const line = r.mode === 'career'
    ? `围绕${roleText}，把实习、AI工具与校招节点规划成同一条可执行的时间线。`
    : r.mode === 'study'
      ? `把${trackText}的申请材料，规划成同一条可执行、可核对的时间线。`
      : `把${trackText}申请与${roleText}职业方向，规划成同一条可执行的时间线。`;

  return { label: modeLabel, eyebrow: 'PLANNING VALUE', line, sections };
}
function cpValuePropositionHtml(state, r) {
  const v = cpValueProposition(state, r);
  return `
    <div class="cp-value-prop">
      <div class="cp-value-head"><small>${v.eyebrow}</small><h2>${cpEsc(v.label)}的规划价值</h2></div>
      <p class="cp-value-line">${v.line}</p>
      <div class="cp-value-grid">
        ${v.sections.map(sec => `
          <article class="cp-value-card">
            <h4>${sec.title}</h4>
            <dl>${sec.items.map(it => `<div><dt>${it.label}</dt><dd>${it.text}</dd></div>`).join('')}</dl>
          </article>`).join('')}
      </div>
    </div>`;
}

const CareerPlanPage = {
  _roles: [],
  _state: null,
  _report: null,
  _stickyObserver: null, // 报告页吸底操作条的显隐监听（顶部工具栏滚出视口才显示）

  _defaults() {
    const cohorts = (DATA.timeline && DATA.timeline.cohorts) || ['27Fall'];
    return {
      mode: 'study-career', // 'study' | 'career' | 'study-career'
      step: 'mode',          // 当前所在向导步骤
      maxStepIndex: 0,        // 已到达过的最深步骤下标，用于控制步骤条可点击回跳
      studentName: '',
      level: 'undergraduate',
      cohort: cohorts[cohorts.length - 1] || cohorts[0],
      countries: [],
      selectedProgramIds: [],
      query: '',
      trackFilter: '',
      schoolCountryFilter: '', // 选校步骤里的国家快速筛选（不改变申请范围里已选定的国家，只影响展示）
      learningSelections: [], // [{resourceId, month:'YYYY-MM'}]
    };
  },

  /* 与 job-library.js 相同的 careers×role_recruitment 合并逻辑，各自独立维护一份；
     同时挂上 jobs[]（用于取 jobs[0].responsibilities 作为职业目标卡片的简短介绍） */
  _buildRoles() {
    const profiles = (DATA.role_recruitment && DATA.role_recruitment.profiles) || {};
    const byRole = new Map();
    (DATA.careers || []).forEach(c => {
      if (!byRole.has(c.role_id)) {
        byRole.set(c.role_id, {
          roleId: c.role_id, industryId: c.industry_id,
          directionZh: c.direction_zh, directionEn: c.direction_en,
          jobs: [],
        });
      }
      byRole.get(c.role_id).jobs.push(c);
    });
    return [...byRole.values()]
      .map(r => ({ ...r, profile: profiles[String(r.roleId)] || null }))
      .sort((a, b) => a.roleId - b.roleId);
  },

  build() {
    this._roles = this._buildRoles();
    this._state = this._defaults();
    this._renderFlow();
  },

  _onCartChanged() { if (!this._state) return; this._renderFlow(); },

  /* ═══ 向导步骤（对齐归档项目 sfk-plan-v2 的 P.step + stepBar） ═══ */
  _stepList() {
    const mode = this._state.mode;
    const list = ['mode'];
    if (mode !== 'study') list.push('target');
    if (mode !== 'career') list.push('scope', 'schools');
    list.push('report');
    return list;
  },
  _stepLabel(id) {
    return { mode: '规划类型', target: '职业目标', scope: '申请范围', schools: '选择院校', report: '生成报告' }[id] || id;
  },
  _canProceed(stepId) {
    if (stepId === 'target') return (window.CareerCart ? CareerCart.getTargets().length : 0) > 0;
    if (stepId === 'schools') return this._state.selectedProgramIds.length > 0;
    return true;
  },
  _hintFor(stepId) {
    if (stepId === 'target') return '请先前往「岗位详情」，点击岗位卡片上的「+」加入至少 1 个职业目标。';
    if (stepId === 'schools') return '请至少选择 1 个候选专业后再生成报告。';
    return '';
  },
  setMode(mode) { this._state.mode = mode; this._renderFlow(); },

  nextStep() {
    const list = this._stepList();
    const idx = list.indexOf(this._state.step);
    if (idx < 0 || idx >= list.length - 1) return;
    this._state.step = list[idx + 1];
    this._state.maxStepIndex = Math.max(this._state.maxStepIndex, idx + 1);
    this._renderFlow();
    this._scrollTop();
  },
  prevStep() {
    const list = this._stepList();
    const idx = list.indexOf(this._state.step);
    if (idx <= 0) return;
    this._state.step = list[idx - 1];
    this._renderFlow();
    this._scrollTop();
  },
  goStep(id) {
    const list = this._stepList();
    const idx = list.indexOf(id);
    if (idx < 0) return;
    const allowed = idx <= this._state.maxStepIndex || (id === 'report' && this._report);
    if (!allowed) return;
    this._state.step = id;
    this._renderFlow();
    this._scrollTop();
  },
  _scrollTop() {
    const el = document.getElementById('cp-flow');
    if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  },
  resetAll() {
    if (!window.confirm('确认清空已选择的规划类型、申请范围与专业，重新开始吗？（学生姓名与已选择的职业目标不会被清空）')) return;
    const name = this._state.studentName;
    this._state = this._defaults();
    this._state.studentName = name;
    this._report = null;
    this._renderFlow();
    this._scrollTop();
  },
  regenerate() { this.generate({ silent: true }); },
  setStudentName(v) {
    this._state.studentName = String(v || '').trim();
    this._renderFlow();
  },

  /* ═══ 候选专业池（对齐归档项目 programStep：只按层级+国家筛选，方向作为辅助排序） ═══ */
  _candidatePrograms() {
    const s = this._state;
    let pool = (DATA.programs || []).filter(p => p.level === s.level);
    if (s.countries.length) pool = pool.filter(p => s.countries.includes(p.country));
    if (s.schoolCountryFilter) pool = pool.filter(p => p.country === s.schoolCountryFilter);
    if (s.trackFilter) pool = pool.filter(p => cpProgramTrack(p) === s.trackFilter);
    if (s.query) {
      const q = s.query.toLowerCase();
      pool = pool.filter(p => `${p.school_zh} ${p.school_en} ${p.program_name_zh} ${p.program_name_en}`.toLowerCase().includes(q));
    }
    const targets = window.CareerCart ? CareerCart.getTargets() : [];
    if (targets.length) {
      const roleText = targets.map(t => `${t.directionZh} ${t.directionEn || ''}`).join(' ');
      const industryId = targets[0].industryId;
      pool = [...pool].sort((a, b) => ProgramScorer.score(b, roleText, '', industryId) - ProgramScorer.score(a, roleText, '', industryId));
    } else {
      pool = [...pool].sort((a, b) => (Number(a.industry_rank) || 9999) - (Number(b.industry_rank) || 9999));
    }
    return pool;
  },

  onQueryInput(v) { this._state.query = v; this._renderSchoolsPanel(); },
  filterTrack(track) { this._state.trackFilter = this._state.trackFilter === track ? '' : track; this._renderFlow(); },
  filterSchoolCountry(code) { this._state.schoolCountryFilter = this._state.schoolCountryFilter === code ? '' : code; this._renderFlow(); },
  /* 选校步骤的国家筛选可选项：已在「申请范围」限定了国家就只在其中筛选，否则给出当前层级下的全部国家 */
  _schoolCountryChipCodes() {
    const s = this._state;
    const present = s.countries.length ? new Set(s.countries) : new Set((DATA.programs || []).filter(p => p.level === s.level).map(p => p.country));
    return cpCountryOrder().filter(c => present.has(c));
  },
  toggleProgram(id) {
    const idx = this._state.selectedProgramIds.indexOf(id);
    if (idx >= 0) this._state.selectedProgramIds.splice(idx, 1);
    else this._state.selectedProgramIds.push(id);
    this._renderSchoolsPanel();
    this._refreshStepFooter('schools');
  },
  _renderSchoolsPanel() {
    const el = document.getElementById('cp-schools-panel');
    if (el) el.innerHTML = this._schoolsPanelHtml();
  },
  _refreshStepFooter(stepId) {
    const el = document.getElementById('cp-step-footer');
    if (el) el.outerHTML = this._stepFooterHtml(stepId);
  },

  /* 按院校分组呈现候选专业（对齐归档项目 programCards：先按学校分组，组内按方向/名称排序） */
  _schoolsPanelHtml() {
    const s = this._state;
    const pool = this._candidatePrograms();
    const groups = new Map();
    pool.forEach(p => {
      const key = p.school_en || p.school_zh;
      if (!groups.has(key)) groups.set(key, { schoolZh: p.school_zh, schoolEn: p.school_en, country: p.country, rank: Number(p.industry_rank) > 0 ? Number(p.industry_rank) : 9999, programs: [] });
      groups.get(key).programs.push(p);
    });
    const ordered = [...groups.values()];
    const groupsHtml = ordered.map(g => `
      <section class="cp-school-group">
        <div class="cp-school-head">
          <div><small>${cpCountryLabel(g.country)}</small><b>${g.schoolZh}</b>${g.schoolEn ? `<em>${g.schoolEn}</em>` : ''}</div>
          <span class="cp-school-rank">${g.rank < 9999 ? '行业参考 #' + String(g.rank).padStart(2, '0') : '扩展院校'}</span>
        </div>
        <div class="cp-program-grid">
          ${g.programs.map(p => {
            const on = s.selectedProgramIds.includes(p.id);
            const track = cpProgramTrack(p);
            return `<button type="button" class="cp-program-card${on ? ' is-selected' : ''}" onclick="CareerPlanPage.toggleProgram('${p.id}')">
              <span class="cp-program-check">${on ? '✓' : ''}</span>
              <span><b>${p.program_name_zh || p.program_name_en}</b><small>${cpTrackMeta()[track].label} · ${p.degree_type || ''} · ${(p.deadline || 'DDL待核实').slice(0, 40)}</small></span>
            </button>`;
          }).join('')}
        </div>
      </section>`).join('');
    const selectedHtml = s.selectedProgramIds.length ? `<div class="cp-selected-programs">${s.selectedProgramIds.map(id => {
      const p = (DATA.programs || []).find(x => x.id === id);
      if (!p) return '';
      return `<div class="cp-selected-chip"><span>${p.school_zh} · ${p.program_name_zh || p.program_name_en}</span><button type="button" onclick="CareerPlanPage.toggleProgram('${id}')">×</button></div>`;
    }).join('')}</div>` : '';
    const note = `<p class="pl-task__meta" style="padding:0 0 var(--space-2)">共 ${ordered.length} 所院校 / ${pool.length} 个符合条件的专业。已选 ${s.selectedProgramIds.length} 个。</p>`;
    return note + (groupsHtml || '<div class="pl-empty">没有符合条件的专业，试试更换国家、层级或方向筛选。</div>') + selectedHtml;
  },

  setLevel(level) {
    if (this._state.level !== level) { this._state.level = level; this._state.selectedProgramIds = []; this._state.schoolCountryFilter = ''; }
    this._renderFlow();
  },
  setCohort(v) { this._state.cohort = v; this._renderFlow(); },
  toggleCountry(code) {
    const s = this._state;
    const idx = s.countries.indexOf(code);
    if (idx >= 0) s.countries.splice(idx, 1);
    else {
      if (s.countries.length >= 2) s.countries.shift();
      s.countries.push(code);
    }
    s.selectedProgramIds = s.selectedProgramIds.filter(id => {
      const p = (DATA.programs || []).find(x => x.id === id);
      return p && (!s.countries.length || s.countries.includes(p.country));
    });
    if (s.schoolCountryFilter && s.countries.length && !s.countries.includes(s.schoolCountryFilter)) s.schoolCountryFilter = '';
    this._renderFlow();
  },

  /* ═══ 学习/实践/背景提升候选：交互式加入个人时间线 ═══ */
  _learningResourceById(id) { return cpLearningCourses().find(c => c.id === id) || null; },
  toggleLearning(id) {
    const s = this._state;
    const idx = s.learningSelections.findIndex(x => x.resourceId === id);
    if (idx >= 0) {
      s.learningSelections.splice(idx, 1);
    } else {
      const resource = this._learningResourceById(id);
      if (!resource) return;
      const opts = cpLearningTermOptions(resource, cpCycleYear(s));
      if (!opts.length) return;
      s.learningSelections.push({ resourceId: id, month: opts[0].value });
    }
    if (this._report) this.generate({ silent: true }); else this._renderFlow();
  },
  setLearningTerm(id, value) {
    const sel = this._state.learningSelections.find(x => x.resourceId === id);
    if (!sel) return;
    sel.month = value;
    if (this._report) this.generate({ silent: true });
  },

  /* ═══ 生成职业规划报告 ═══ */
  generate(opts = {}) {
    const s = this._state;
    const targets = window.CareerCart ? CareerCart.getTargets() : [];
    const selectedPrograms = s.selectedProgramIds
      .map(id => (DATA.programs || []).find(p => p.id === id))
      .filter(Boolean).map(p => ({ p }));
    const cycleYear = cpCycleYear(s);

    const deadlines = selectedPrograms.map(({ p }) => {
      const raw = p.deadline || '';
      const unavailable = /(暂停|suspend|不可申请|无可提交|停招|停止招生)/i.test(raw + ' ' + (p.caution || ''));
      const parsed = unavailable ? null : cpParseDeadline(raw, cycleYear);
      const estimated = !parsed;
      const date = parsed ? parsed.date : (unavailable ? null : cpFallbackDeadline(p.country, cycleYear));
      return { p, date, estimated, unavailable, raw: raw || '当季 DDL 尚未发布，暂按上一申请季窗口规划。' };
    }).sort((a, b) => (a.date || new Date(2999, 0, 1)) - (b.date || new Date(2999, 0, 1)));

    const plan = cpAggregatePortfolio(selectedPrograms);
    const tracks = cpProgramTrackSummary(selectedPrograms);
    const priority = cpSchoolPrioritySelection(selectedPrograms, 8);
    const deadlineByProgId = new Map(deadlines.map(d => [d.p.id, d]));
    const dual = s.mode === 'study-career';

    const stages = (s.mode !== 'career' && selectedPrograms.length) ? cpStageRoadmap(plan, tracks, deadlines, cycleYear) : [];
    const careerEvents = (s.mode !== 'study' && targets.length) ? cpCareerTimelineEvents(targets, cycleYear, dual) : [];
    const learningEvents = (s.mode !== 'career') ? cpSelectedLearningEvents(s, cpLearningCourses()) : [];
    const timelineGroups = cpTimelineData(plan, deadlines, cycleYear, [...careerEvents, ...learningEvents]);

    this._report = { mode: s.mode, targets, selectedPrograms, cycleYear, deadlines, plan, tracks, priority, deadlineByProgId, stages, timelineGroups };
    s.step = 'report';
    const reportIdx = this._stepList().indexOf('report');
    s.maxStepIndex = Math.max(s.maxStepIndex, reportIdx);
    this._renderFlow();
    if (!opts.silent) this._scrollTop();
  },

  /* ═══ 报告渲染 ═══ */
  _targetCardsHtml(targets) {
    const labels = ['主目标', '次目标', '探索目标'];
    return `<div class="cp-target-cards">${targets.map((t, i) => {
      const role = this._roles.find(x => x.roleId === t.roleId);
      const first = role && role.jobs && role.jobs[0];
      const intro = (first && (first.responsibilities || first.talent_summary)) || (role && role.profile && role.profile.dailyWork && role.profile.dailyWork[0]) || '';
      return `<div class="cp-target-card"><small>${labels[i]}</small><b>${t.directionZh}</b>${intro ? `<p>${intro}</p>` : ''}</div>`;
    }).join('')}</div>`;
  },
  _careerResourceBodyHtml(targets) {
    const resources = cpCareerResources(targets);
    const tools = cpAiToolsForTarget(targets[0]);
    const resBlock = (label, items) => `
      <article class="cp-resource-block">
        <small>${label}</small>
        ${items.length ? `<ul>${items.map(r => `<li><b>${r.name}</b><span>${r.isTopPlatform ? '头部资源' : r.isAi ? 'AI资源' : '岗位相关'}</span></li>`).join('')}</ul>` : '<div class="pl-empty" style="padding:12px 0">当前资源库暂无完全匹配候选，需由顾问补充相邻资源。</div>'}
      </article>`;
    return `
      ${this._targetCardsHtml(targets)}
      <p class="pl-task__meta" style="margin:var(--space-4) 0 0"><strong>AI工具建议：</strong>${tools.join('；') || '生成式AI基础、AI影像工作流、版权与合规'}</p>
      <div class="cp-resource-grid" style="margin-top:var(--space-4)">
        ${resBlock('第1段实习 · 岗位高度相关', resources.related)}
        ${resBlock('第2段实习 · 头部平台／高质量公司', resources.top)}
        ${resBlock('第3段经历 · AI商业项目／AI影视实习', resources.ai)}
      </div>`;
  },
  _learningSectionBodyHtml(r) {
    const s = this._state;
    const candidates = cpLearningResourceCandidates(r.tracks.map(t => t.key));
    const selectedCount = (s.learningSelections || []).length;
    const cards = candidates.map(c => {
      const sel = (s.learningSelections || []).find(x => x.resourceId === c.id);
      const opts = cpLearningTermOptions(c, r.cycleYear);
      const current = (sel && sel.month) || (opts[0] && opts[0].value) || '';
      return `
        <article class="cp-learning-card${sel ? ' is-selected' : ''}">
          <div class="cp-learning-flags"><small>${c.program_type || ''}${c.seasons.length ? ' · ' + c.seasons.map(x => (cpSeasons()[x] && cpSeasons()[x].label) || x).join(' / ') : ''}</small><em>${c.recommended ? '与所选专业方向匹配' : '可选扩展'}</em></div>
          <b>${c.role_or_course}</b>
          ${c.description ? `<p>${c.description}</p>` : ''}
          ${c.outcomes ? `<p class="cp-learning-outcomes"><strong>预期产出：</strong>${c.outcomes}</p>` : ''}
          <div class="cp-learning-footer">
            <label class="cp-learning-term">安排学期
              <div class="cp-select-wrap"><select class="cp-select" ${!opts.length ? 'disabled' : ''} onchange="CareerPlanPage.setLearningTerm('${c.id}', this.value)">
                ${opts.length ? opts.map(o => `<option value="${o.value}" ${o.value === current ? 'selected' : ''}>${o.label}</option>`).join('') : '<option>暂无可选学期</option>'}
              </select></div>
            </label>
            <button type="button" class="pl-btn ${sel ? '' : 'pl-btn--primary'}" ${!opts.length ? 'disabled' : ''} onclick="CareerPlanPage.toggleLearning('${c.id}')">${sel ? '从时间线移除' : '加入个人时间线'}</button>
          </div>
        </article>`;
    }).join('');
    const selectedList = (s.learningSelections || []).map(sel => {
      const c = candidates.find(x => x.id === sel.resourceId);
      if (!c) return '';
      return `<div class="cp-selected-chip"><span>${sel.month.replace('-', '年') + '月 · ' + c.role_or_course}</span><button type="button" onclick="CareerPlanPage.toggleLearning('${c.id}')">×</button></div>`;
    }).join('');
    return `
      <p class="pl-task__meta" style="margin-top:0">选择具体课程或项目并指定学期，会自动加入下方按月时间线；候选来自SFK海外院校课程与商业实践库，需由顾问确认当期名额与开课安排。已加入 ${selectedCount} 项。</p>
      <div class="cp-learning-grid">${cards || '<div class="pl-empty">当前课程库暂无候选。</div>'}</div>
      ${selectedList ? `<div class="cp-selected-programs" style="margin-top:var(--space-4)">${selectedList}</div>` : ''}`;
  },
  /* 编号分区容器，统一报告内各大段的视觉层级（对齐归档项目按顺序呈现"规划价值→鼓励语→
     概览→专业分布→产出→阶段计划→学习实践→DDL总表→职业资源→按月时间线"的信息层级） */
  _sectionHtml(num, title, meta, bodyHtml) {
    return `<div class="pl-group"><div class="pl-group__head"><div class="pl-group__title"><span class="cp-section-num">${String(num).padStart(2, '0')}</span>${title}</div><div class="pl-group__meta">${meta || ''}</div></div><div style="padding:var(--space-5)">${bodyHtml}</div></div>`;
  },
  _renderReportHtml(r) {
    const s = this._state;
    const name = s.studentName || '你';
    const modeLabelText = r.mode === 'study' ? '留学规划' : r.mode === 'career' ? '职业规划' : '留学+就业双规划';
    const summaryStatsHtml = `
      <div class="pl-summary cp-report-summary">
        <div class="pl-stat"><div class="pl-stat__k">规划类型</div><div class="pl-stat__v" style="font-size:var(--text-md)">${modeLabelText}</div></div>
        <div class="pl-stat"><div class="pl-stat__k">职业目标</div><div class="pl-stat__v">${r.targets.length}/${cpMaxTargets()}</div></div>
        <div class="pl-stat"><div class="pl-stat__k">申请层级</div><div class="pl-stat__v">${s.level === 'undergraduate' ? '本科' : '研究生'}</div></div>
        <div class="pl-stat"><div class="pl-stat__k">申请季</div><div class="pl-stat__v">${s.cohort}</div></div>
        <div class="pl-stat"><div class="pl-stat__k">国家范围</div><div class="pl-stat__v" style="font-size:var(--text-md)">${s.countries.length ? s.countries.map(c => cpCountryLabel(c)).join(' + ') : '不限'}</div></div>
        <div class="pl-stat"><div class="pl-stat__k">已选专业</div><div class="pl-stat__v">${r.selectedPrograms.length}</div></div>
      </div>`;

    let n = 0;
    let html = cpValuePropositionHtml(s, r);
    html += `<div class="cp-encouragement"><small>SFK PERSONAL ENCOURAGEMENT</small><p>${cpPlanEncouragement(r.mode)}</p></div>`;
    html += this._sectionHtml(++n, `${cpEsc(name)}的规划概览`, modeLabelText, summaryStatsHtml);

    if (r.mode !== 'career') {
      if (!r.selectedPrograms.length) {
        html += '<div class="pl-empty">尚未选择具体专业，请返回上一步选择候选专业后重新生成。</div>';
      } else {
        html += this._sectionHtml(++n, '你的申请专业分布', r.selectedPrograms.length + '个专业', cpProgramTrackHtml(r.tracks));
        html += this._sectionHtml(++n, '汇总后的作品集与材料产出', r.plan.outputs.length + '组产出', cpOutputSummaryHtml(r.plan));
        html += this._sectionHtml(++n, '阶段执行计划', '', cpStageRoadmapHtml(r.stages));
        html += this._sectionHtml(++n, '学习、实践与背景提升候选', '', this._learningSectionBodyHtml(r));
        html += this._sectionHtml(++n, '申请要求与DDL总表', '', cpApplicationRequirementTableHtml(r.priority, r.deadlineByProgId));
      }
    }

    if (r.mode !== 'study') {
      if (!r.targets.length) {
        html += `<div class="pl-empty">尚未选择职业目标，请前往「岗位详情」点击卡片上的「+」加入职业目标（最多${cpMaxTargets()}个）。</div>`;
      } else {
        html += this._sectionHtml(++n, '职业目标与三段行业经历', '资源库 ' + cpCareerResources(r.targets).sourceCount + ' 条', this._careerResourceBodyHtml(r.targets));
      }
    }

    html += this._sectionHtml(++n, '推荐课程产品', '', cpCourseProductsHtml(r.mode, r.targets, r.tracks));

    html += this._sectionHtml(++n, '按月关键节点', r.timelineGroups.length + '个月份', cpMonthlyTimelineHtml(r.timelineGroups));

    html += `<p style="font-size:var(--text-xs);color:var(--color-text-faint);line-height:1.7">规划基于当前院校与岗位数据库自动匹配生成，DDL、作品集要求与实习资源均以官网／顾问当季核实信息为准。</p>`;
    return html;
  },

  /* ═══ 分步向导 · 每一步的独立内容 ═══ */
  _stepFooterHtml(stepId) {
    const list = this._stepList();
    const idx = list.indexOf(stepId);
    const isFirst = idx === 0;
    const isLastInput = idx === list.length - 2;
    const canNext = this._canProceed(stepId);
    return `<div class="pl-actions cp-step-actions" id="cp-step-footer">
      <button class="pl-btn" ${isFirst ? 'disabled' : ''} onclick="CareerPlanPage.prevStep()">← 上一步</button>
      <button class="pl-btn pl-btn--primary" ${canNext ? '' : 'disabled'} onclick="CareerPlanPage.${isLastInput ? 'generate' : 'nextStep'}()">${isLastInput ? '生成规划报告 →' : '下一步 →'}</button>
      ${!canNext ? `<p class="pl-task__meta" style="width:100%;margin:8px 0 0">${this._hintFor(stepId)}</p>` : ''}
    </div>`;
  },
  // 「选择院校」步骤内容可能很长，改用与报告页一致的吸底悬浮操作条（.cp-sticky-actions）：
  // 滚动过步骤顶部工具栏（如 #cp-schools-toolbar）后才淡入滑入，样式与交互逻辑
  // 完全复用 _reportStickyActionsHtml / _setupStickyObserver 的既有实现。
  _stepStickyActionsHtml(stepId) {
    const list = this._stepList();
    const idx = list.indexOf(stepId);
    const isFirst = idx === 0;
    const isLastInput = idx === list.length - 2;
    const canNext = this._canProceed(stepId);
    return `<div class="cp-sticky-actions" role="toolbar" aria-label="${this._stepLabel(stepId)}操作">
      <button class="pl-btn" ${isFirst ? 'disabled' : ''} onclick="CareerPlanPage.prevStep()"><span>←</span>上一步</button>
      <button class="pl-btn pl-btn--primary" ${canNext ? '' : 'disabled'} title="${canNext ? '' : this._hintFor(stepId)}" onclick="CareerPlanPage.${isLastInput ? 'generate' : 'nextStep'}()">${isLastInput ? '生成规划报告' : '下一步'}</button>
    </div>`;
  },
  _modeStepHtml() {
    const s = this._state;
    const choices = (DATA.career_planning && DATA.career_planning.planModeChoices) || [];
    return `<div class="pl-card">
      <div class="pl-card__label">选择规划入口</div>
      <p class="pl-task__meta" style="margin:0 0 var(--space-4)">职业目标可以直接在「岗位详情」中选择；职业规划与留学 + 就业双规划都需要先确认至少 1 个职业目标。</p>
      <div class="pl-modes pl-modes--cards">
        ${choices.map(c => `<button type="button" class="pl-mode${s.mode === c.id ? ' is-active' : ''}" onclick="CareerPlanPage.setMode('${c.id}')"><span class="pl-mode__title">${c.label}</span><span class="pl-mode__desc">${c.desc}</span></button>`).join('')}
      </div>
      ${this._stepFooterHtml('mode')}
    </div>`;
  },
  _targetStepHtml() {
    const targets = window.CareerCart ? CareerCart.getTargets() : [];
    return `<div class="pl-card">
      <div class="pl-card__label">确认职业目标（${targets.length}/${cpMaxTargets()}）</div>
      ${targets.length ? this._targetCardsHtml(targets) : `<p class="pl-task__meta" style="margin-top:0">还没有选择职业目标。请前往<strong>「岗位详情」</strong>视图，点击岗位卡片上的「+」加入职业目标，最多可选 ${cpMaxTargets()} 个（主目标／次目标／探索目标）。</p>`}
      <div class="pl-actions" style="margin-top:var(--space-3)"><button class="pl-btn" onclick="PlanningViews.switch('jobs', document.querySelector('#planning-view-tabs [data-view=&quot;jobs&quot;]'))">去岗位库选择 →</button><button class="pl-btn" onclick="PlanningViews.goToAssessmentRetake()">重做职业测评</button></div>
      ${this._stepFooterHtml('target')}
    </div>`;
  },
  _scopeStepHtml() {
    const s = this._state;
    const present = new Set((DATA.programs || []).map(p => p.country));
    const codes = cpCountryOrder().filter(c => present.has(c));
    return `<div class="pl-card">
      <div class="pl-card__label">设置申请范围</div>
      <div class="pl-modes" style="flex-direction:row;flex-wrap:wrap;gap:var(--space-2);margin-bottom:var(--space-4)">
        ${[['undergraduate', '本科申请'], ['graduate', '研究生申请']].map(([id, label]) => `<button type="button" class="pl-mode${s.level === id ? ' is-active' : ''}" onclick="CareerPlanPage.setLevel('${id}')">${label}</button>`).join('')}
      </div>
      <div class="pl-fields">
        <div>
          <label class="pl-field__label" for="cp-cohort">申请季</label>
          <div class="cp-select-wrap"><select id="cp-cohort" class="cp-select" onchange="CareerPlanPage.setCohort(this.value)">${((DATA.timeline && DATA.timeline.cohorts) || ['27Fall']).map(c => `<option value="${c}" ${s.cohort === c ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
        </div>
      </div>
      <div class="pl-field__label" style="margin-top:var(--space-4)">国家 / 地区（最多选两个，不选默认不限）</div>
      <div class="country-pills">${codes.map(c => `<button type="button" class="country-pill${s.countries.includes(c) ? ' is-active' : ''}" onclick="CareerPlanPage.toggleCountry('${c}')">${cpCountryLabel(c)}</button>`).join('')}</div>
      ${this._stepFooterHtml('scope')}
    </div>`;
  },
  _schoolsStepHtml() {
    const s = this._state;
    const trackChips = Object.entries(cpTrackMeta()).map(([key, meta]) =>
      `<button class="filter-btn${s.trackFilter === key ? ' is-active' : ''}" onclick="CareerPlanPage.filterTrack('${key}')">${meta.label}</button>`).join('');
    const countryCodes = this._schoolCountryChipCodes();
    const countryChips = countryCodes.map(code =>
      `<button class="filter-btn${s.schoolCountryFilter === code ? ' is-active' : ''}" onclick="CareerPlanPage.filterSchoolCountry('${code}')">${cpCountryLabel(code)}</button>`).join('');
    return `<div class="pl-card">
      <div class="pl-card__label" id="cp-schools-toolbar">选择具体院校与专业</div>
      <input class="jobs-search" oninput="CareerPlanPage.onQueryInput(this.value)" placeholder="搜索学校或专业" value="${cpEsc(s.query)}">
      <div class="pl-field__label" style="margin-top:var(--space-3)">产业方向</div>
      <div class="filter-bar">${trackChips}</div>
      ${countryCodes.length > 1 ? `<div class="pl-field__label" style="margin-top:var(--space-2)">国家 / 地区</div><div class="filter-bar">${countryChips}</div>` : ''}
      <div id="cp-schools-panel" style="margin-top:var(--space-3)">${this._schoolsPanelHtml()}</div>
      ${this._stepStickyActionsHtml('schools')}
    </div>`;
  },
  _reportStepHtml(r) {
    const list = this._stepList();
    const lastInput = list[list.length - 2];
    return `
      <div class="pl-card cp-report-toolbar" id="cp-report-toolbar">
        <div class="cp-report-toolbar__row">
          <div>
            <div class="pl-card__label" style="margin-bottom:4px">规划报告</div>
            <p class="pl-task__meta" style="margin:0">已根据当前选择生成；修改选择后点击「重新生成报告」刷新。</p>
          </div>
          <div class="pl-actions">
            <button class="pl-btn" onclick="CareerPlanPage.goStep('${lastInput}')">← 返回修改选择</button>
            <button class="pl-btn" onclick="CareerPlanPage.regenerate()">重新生成报告</button>
            <button class="pl-btn pl-btn--primary" onclick="CareerPlanPage.exportPdf()">导出 PDF</button>
            <button class="pl-btn pl-btn--ghost" onclick="CareerPlanPage.resetAll()">清空并重新开始</button>
          </div>
        </div>
      </div>
      <div class="cp-report-sections">${this._renderReportHtml(r)}</div>
      ${this._reportStickyActionsHtml(lastInput)}`;
  },
  /* 报告页很长，顶部工具栏滚动后就看不到了；这里加一条吸底的悬浮操作条，
     滚动到任何位置都能返回/重新生成/导出/清空，按钮与顶部工具栏保持同一套操作。
     默认隐藏，只有顶部工具栏（#cp-report-toolbar）滚出视口后才带动效滑入，见 _setupStickyObserver。 */
  _reportStickyActionsHtml(lastInput) {
    return `<div class="cp-sticky-actions" role="toolbar" aria-label="规划报告操作">
      <button class="pl-btn" onclick="CareerPlanPage.goStep('${lastInput}')"><span>←</span>返回修改</button>
      <button class="pl-btn" onclick="CareerPlanPage.regenerate()">重新生成</button>
      <button class="pl-btn pl-btn--primary" onclick="CareerPlanPage.exportPdf()">导出 PDF</button>
      <button class="pl-btn pl-btn--ghost" onclick="CareerPlanPage.resetAll()">清空重开</button>
    </div>`;
  },
  /* 用 IntersectionObserver 盯住顶部工具栏：它还在视口内时吸底条保持隐藏，
     一旦滚动到它离开视口（往下滚），吸底条才淡入滑入；往回滚看到顶部工具栏时又隐藏。
     每次重新渲染报告页（_renderFlow）都要重建，因为旧的 DOM 节点已被整体替换。 */
  _setupStickyObserver(toolbarId) {
    if (this._stickyObserver) { this._stickyObserver.disconnect(); this._stickyObserver = null; }
    const toolbar = document.getElementById(toolbarId || 'cp-report-toolbar');
    const sticky = document.querySelector('.cp-sticky-actions');
    if (!toolbar || !sticky) return;
    if (!('IntersectionObserver' in window)) { sticky.classList.add('is-visible'); return; }
    this._stickyObserver = new IntersectionObserver(entries => {
      sticky.classList.toggle('is-visible', !entries[0].isIntersecting);
    }, { threshold: 0 });
    this._stickyObserver.observe(toolbar);
  },
  _teardownStickyObserver() {
    if (this._stickyObserver) { this._stickyObserver.disconnect(); this._stickyObserver = null; }
  },

  _studentBarHtml() {
    const s = this._state;
    return `<div class="cp-student-bar">
      <label>学生姓名<input type="text" id="cp-student-name-input" maxlength="40" placeholder="填写后将显示在报告标题与导出的 PDF 中" value="${cpEsc(s.studentName)}" onchange="CareerPlanPage.setStudentName(this.value)"></label>
    </div>`;
  },
  _stepsIndicatorHtml() {
    const list = this._stepList();
    const s = this._state;
    return `<div class="cp-steps">${list.map((id, i) => {
      const active = s.step === id;
      const reachable = i <= s.maxStepIndex || (id === 'report' && this._report);
      return `<button type="button" class="cp-step${active ? ' is-active' : ''}${(reachable && !active) ? ' is-done' : ''}" ${reachable ? `onclick="CareerPlanPage.goStep('${id}')"` : 'disabled'}>
        <span class="cp-step__num">${String(i + 1).padStart(2, '0')}</span><span class="cp-step__label">${this._stepLabel(id)}</span>
      </button>`;
    }).join('')}</div>`;
  },
  _stepBodyHtml(step) {
    if (step === 'mode') return this._modeStepHtml();
    if (step === 'target') return this._targetStepHtml();
    if (step === 'scope') return this._scopeStepHtml();
    if (step === 'schools') return this._schoolsStepHtml();
    return '';
  },

  /* ═══ 整体渲染：学生姓名条 + 步骤指示条 + 当前步骤内容（单步展示，非纵向堆叠全部步骤） ═══ */
  _renderFlow() {
    const el = document.getElementById('cp-flow');
    if (!el) return;
    const s = this._state;
    const list = this._stepList();
    if (!list.includes(s.step)) s.step = list[0];
    let bodyHtml;
    if (s.step === 'report' && this._report) {
      bodyHtml = this._reportStepHtml(this._report);
    } else {
      if (s.step === 'report') s.step = list[list.length - 2];
      bodyHtml = this._stepBodyHtml(s.step);
    }
    el.innerHTML = this._studentBarHtml() + this._stepsIndicatorHtml() + bodyHtml;
    if (s.step === 'report' && this._report) this._setupStickyObserver('cp-report-toolbar');
    else if (s.step === 'schools') this._setupStickyObserver('cp-schools-toolbar');
    else this._teardownStickyObserver();
  },

  /* ═══ PDF 导出（新窗口打印预览，直接采用归档项目 plan-pdf-export.js 的报告模板：
        封面页 + 内容页，配色变量（--ink/--muted/--line/--soft/--accent/--accent-dark）、
        分区编号条、规划价值卡片、时间轴圆点连接线等视觉与字符样式均对齐归档版本；
        字体复用站内已自托管的 Noto Sans SC / Space Grotesk，不额外引入归档站的专用报告字体文件） ═══ */
  _pdfSection(num, title, meta, html) {
    return `<section class="report-section"><div class="report-section-title"><em>${String(num).padStart(2, '0')}</em><h2>${title}</h2></div>${meta ? `<p class="section-lead">${meta}</p>` : ''}${html}</section>`;
  },
  exportPdf() {
    const r = this._report;
    if (!r) { window.alert('请先生成职业规划报告后再导出 PDF。'); return; }
    const s = this._state;

    /* 导出前的姓名校验：不再用 banner 提示，改为导出时弹窗要求填写（归档版本同样把姓名当作报告的必需信息） */
    if (!s.studentName) {
      const input = window.prompt('导出 PDF 前，请先填写学生姓名（将显示在报告封面与文件标题中）：');
      if (input == null || !input.trim()) { window.alert('未填写学生姓名，已取消导出。'); return; }
      this.setStudentName(input);
    }

    const win = window.open('', '_blank');
    if (!win) { window.alert('浏览器拦截了新窗口，请允许弹窗后重试。'); return; }

    const name = s.studentName || '未命名学生';
    const modeLabel = r.mode === 'study' ? '留学规划' : r.mode === 'career' ? '职业规划' : '留学+就业双规划';
    const generatedDate = new Date().toLocaleDateString('zh-CN');
    const countryText = s.countries.length ? s.countries.map(c => cpCountryLabel(c)).join(' + ') : '不限';
    const coverMetaHtml = `
      <div class="cover-meta">
        <div><small>规划类型</small><b>${modeLabel}</b></div>
        <div><small>职业目标</small><b>${r.targets.map(t => t.directionZh).join(' / ') || '—'}</b></div>
        <div><small>申请层级</small><b>${s.level === 'undergraduate' ? '本科' : '研究生'}</b></div>
        <div><small>申请季</small><b>${s.cohort}</b></div>
        <div><small>国家范围</small><b>${countryText}</b></div>
        <div><small>已选专业</small><b>${r.selectedPrograms.length} 个</b></div>
      </div>`;
    const summaryHtml = `
      <div class="report-summary">
        <div><small>规划类型</small><b>${modeLabel}</b></div>
        <div><small>职业目标</small><b>${r.targets.length}/${cpMaxTargets()}</b></div>
        <div><small>申请层级</small><b>${s.level === 'undergraduate' ? '本科' : '研究生'}</b></div>
        <div><small>申请季</small><b>${s.cohort}</b></div>
        <div><small>国家范围</small><b>${countryText}</b></div>
        <div><small>已选专业</small><b>${r.selectedPrograms.length} 个</b></div>
      </div>`;

    let n = 0;
    const sections = [];
    sections.push(this._pdfSection(++n, '规划价值', '', cpValuePropositionHtml(s, r)));
    sections.push(this._pdfSection(++n, `${cpEsc(name)}的规划概览`, modeLabel, summaryHtml));
    if (r.mode !== 'career' && r.selectedPrograms.length) {
      sections.push(this._pdfSection(++n, '你的申请专业分布', r.selectedPrograms.length + '个专业', cpProgramTrackHtml(r.tracks)));
      sections.push(this._pdfSection(++n, '汇总后的作品集与材料产出', r.plan.outputs.length + '组产出', cpOutputSummaryHtml(r.plan)));
      sections.push(this._pdfSection(++n, '阶段执行计划', '', cpStageRoadmapHtml(r.stages)));
      sections.push(this._pdfSection(++n, '申请要求与DDL总表', '', cpApplicationRequirementTableHtml(r.priority, r.deadlineByProgId)));
    }
    if (r.mode !== 'study' && r.targets.length) {
      sections.push(this._pdfSection(++n, '职业目标与三段行业经历', '资源库 ' + cpCareerResources(r.targets).sourceCount + ' 条', this._careerResourceBodyHtml(r.targets)));
    }
    sections.push(this._pdfSection(++n, '按月关键节点', r.timelineGroups.length + '个月份', cpMonthlyTimelineHtml(r.timelineGroups)));

    const fontsHref = new URL('assets/css/fonts.css', window.location.href).href;
    win.document.write(`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${cpEsc(name)}的${modeLabel}报告</title><link rel="stylesheet" href="${cpEsc(fontsHref)}"><style>${CP_PDF_CSS}</style></head>
      <body>
        <div class="report-toolbar">
          <button type="button" onclick="window.close()">关闭预览</button>
          <button type="button" class="primary" onclick="window.print()">打印 / 保存为 PDF</button>
        </div>
        <main class="report-document">
          <section class="report-cover">
            <div>
              <div class="cover-brand">SFK · 影视传媒科系</div>
              <div class="cover-main">
                <div class="cover-eyebrow">Personal Planning Report</div>
                <h1 class="cover-name">${cpEsc(name)}</h1>
                <p class="cover-title">${modeLabel}</p>
                <section class="report-encouragement"><small>给你的这一句话</small><p>${cpPlanEncouragement(r.mode)}</p></section>
                ${coverMetaHtml}
              </div>
            </div>
            <div class="cover-foot"><span>基于已选择的专业、职业目标与SFK资源库生成</span><span>${generatedDate}</span></div>
          </section>
          <div class="report-content">
            <header class="report-intro">
              <div><h1>${cpEsc(name)}的${modeLabel}</h1><p>本报告仅呈现该学生的个人申请、作品、学习、实践、实习与时间安排。申请题目与资源开放状态仍需按当季官方信息和顾问确认更新。</p></div>
              <div class="report-stamp">SFK<br>PERSONAL PLAN</div>
            </header>
            ${sections.join('')}
            <footer class="report-footer"><span>生成日期：${generatedDate}。本规划保存在当前浏览器本地，正式执行前请由顾问复核。</span><span>SFK International Art Education</span></footer>
          </div>
        </main>
      </body></html>`);
    win.document.close();
    setTimeout(() => { try { win.focus(); win.print(); } catch (e) { /* 忽略 */ } }, 400);
  },
};

const CP_PDF_CSS = `
  :root{
    --ink:#1b1720; --muted:#6f6873; --line:#d9d2dc; --soft:#f6f2f7;
    --accent:#9d4f84; --accent-dark:#6f315c; --paper:#fff;
  }
  *{box-sizing:border-box;}
  html,body{margin:0;padding:0;background:#ede9ef;color:var(--ink);font-family:"Noto Sans SC","PingFang SC","Microsoft YaHei","Noto Sans CJK SC",Arial,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
  body{padding:32px 0 72px;}
  .report-toolbar{position:fixed;z-index:20;left:50%;bottom:18px;transform:translateX(-50%);display:flex;gap:10px;padding:10px;border:1px solid rgba(27,23,32,.12);border-radius:999px;background:rgba(255,255,255,.94);box-shadow:0 12px 36px rgba(35,24,39,.18);}
  .report-toolbar button{border:1px solid var(--line);border-radius:999px;background:#fff;color:var(--ink);font:600 13px/1 inherit;padding:11px 18px;cursor:pointer;}
  .report-toolbar button.primary{background:var(--accent);border-color:var(--accent);color:#fff;}
  .report-document{width:210mm;margin:0 auto;background:var(--paper);box-shadow:0 16px 48px rgba(35,24,39,.16);}

  /* 封面页：品牌线 + 大标题 + 给你的这一句话 + 概览网格（对齐归档报告封面设计） */
  .report-cover{min-height:270mm;padding:22mm 19mm 17mm;display:flex;flex-direction:column;justify-content:space-between;position:relative;overflow:hidden;background:linear-gradient(145deg,#fff 0%,#fff 56%,#f3eaf2 100%);page-break-after:always;}
  .report-cover:before{content:"";position:absolute;width:95mm;height:95mm;border-radius:50%;right:-35mm;top:-30mm;border:1px solid rgba(157,79,132,.28);}
  .report-cover:after{content:"";position:absolute;width:58mm;height:58mm;border-radius:50%;right:8mm;top:10mm;background:radial-gradient(circle,rgba(157,79,132,.18),rgba(157,79,132,0) 68%);}
  .cover-brand{position:relative;z-index:1;font-size:11px;font-weight:700;letter-spacing:.18em;color:var(--accent-dark);}
  .cover-main{position:relative;z-index:1;margin-top:40mm;}
  .cover-eyebrow{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--accent);font-weight:700;margin-bottom:10mm;}
  .cover-name{font-size:35px;line-height:1.2;letter-spacing:.02em;margin:0 0 5mm;font-weight:700;}
  .cover-title{font-size:20px;line-height:1.5;color:#443c48;margin:0;max-width:130mm;font-weight:600;}
  .cover-meta{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4mm 12mm;margin-top:16mm;padding-top:8mm;border-top:1px solid rgba(27,23,32,.18);max-width:140mm;}
  .cover-meta div{min-width:0;}
  .cover-meta small{display:block;color:var(--muted);font-size:9px;letter-spacing:.08em;margin-bottom:1.5mm;}
  .cover-meta b{display:block;font-size:12px;line-height:1.45;word-break:break-word;}
  .cover-foot{position:relative;z-index:1;display:flex;justify-content:space-between;align-items:flex-end;border-top:1px solid rgba(27,23,32,.14);padding-top:5mm;color:var(--muted);font-size:9px;line-height:1.6;}
  .report-encouragement{margin:9mm 0 0;padding:5mm 6mm;border-left:3px solid var(--accent);background:linear-gradient(90deg,#f7eef5,#fff);break-inside:avoid;}
  .report-encouragement small{display:block;color:var(--accent-dark);font-size:9.5px;font-weight:700;letter-spacing:.12em;margin-bottom:2mm;}
  .report-encouragement p{margin:0;font-size:11.5px;line-height:1.75;color:#3f3742;}

  /* 内容页 */
  .report-content{padding:14mm 16mm 0;}
  .report-intro{display:flex;align-items:flex-start;justify-content:space-between;gap:12mm;padding-bottom:7mm;margin-bottom:9mm;border-bottom:2px solid var(--ink);}
  .report-intro h1{font-size:23px;line-height:1.3;margin:0 0 2mm;}
  .report-intro p{font-size:11px;line-height:1.7;color:var(--muted);margin:0;max-width:125mm;}
  .report-stamp{flex:0 0 auto;border:1px solid var(--accent);color:var(--accent-dark);font-size:9px;font-weight:700;letter-spacing:.08em;padding:3mm 4mm;border-radius:2px;text-align:center;}
  .report-summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:3mm;margin:0 0 9mm;}
  .report-summary>div{border:1px solid var(--line);background:var(--soft);padding:4mm;min-height:19mm;}
  .report-summary small{display:block;color:var(--muted);font-size:9.5px;margin-bottom:1.5mm;}
  .report-summary b{display:block;font-size:12.5px;line-height:1.45;word-break:break-word;}
  .report-section{margin:0 0 10mm;break-inside:auto;}
  .report-section-title{display:flex;align-items:center;gap:3mm;margin:0 0 4mm;padding-bottom:2.5mm;border-bottom:1px solid var(--line);}
  .report-section-title em{font-style:normal;color:var(--accent);font-size:9px;font-weight:700;letter-spacing:.1em;}
  .report-section-title h2{font-size:18px;line-height:1.35;margin:0;}
  .section-lead{font-size:11.2px;line-height:1.7;color:#4c4550;margin:0 0 4mm;}
  .report-footer{margin-top:12mm;padding-top:4mm;border-top:1px solid var(--line);display:flex;justify-content:space-between;gap:8mm;color:var(--muted);font-size:8px;line-height:1.55;}

  /* 规划价值：卡片保持一行不换行 */
  .cp-value-prop{border:1px solid var(--line);background:linear-gradient(135deg,#fbf6fa,#fff);padding:5mm;border-radius:2px;break-inside:avoid;}
  .cp-value-head{display:flex;justify-content:space-between;align-items:baseline;gap:5mm;}
  .cp-value-head small{display:block;color:var(--accent-dark);font-size:8px;letter-spacing:.1em;font-weight:700;}
  .cp-value-head h2{font-size:14px;margin:1mm 0 0;}
  .cp-value-line{font-size:12px;line-height:1.7;margin:4mm 0;color:var(--ink);}
  .cp-value-grid{display:flex;flex-wrap:nowrap;gap:3mm;}
  .cp-value-card{flex:1 1 0;min-width:0;padding:3mm;border:1px solid var(--line);background:#fff;border-radius:2px;break-inside:avoid;}
  .cp-value-card h4{margin:0 0 2mm;font-size:9.5px;color:var(--accent-dark);}
  .cp-value-card dl{margin:0;}
  .cp-value-card dt{font-size:8px;color:var(--muted);text-transform:uppercase;margin-top:2mm;}
  .cp-value-card dt:first-child{margin-top:0;}
  .cp-value-card dd{margin:.8mm 0 0;font-size:8.5px;line-height:1.55;color:#514a55;}

  /* 专业方向分布 / 阶段执行 / 职业资源：2列网格卡片 */
  .cp-track-grid,.cp-output-stats,.cp-resource-grid,.cp-learning-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:3mm;}
  .cp-track-card,.cp-output-stats article,.cp-resource-block,.cp-target-card,.cp-learning-card{background:#fff;color:var(--ink);border:1px solid var(--line);border-radius:2px;break-inside:avoid;padding:4mm;box-shadow:none;}
  .cp-track-card b,.cp-output-stats b,.cp-resource-block b,.cp-target-card b,.cp-learning-card b{font-size:10.5px;line-height:1.45;color:var(--ink);}
  .cp-track-card p,.cp-output-stats span,.cp-resource-block p,.cp-target-card p,.cp-learning-card p{font-size:9px;line-height:1.6;color:#514a55;margin:2mm 0 0;}
  .cp-track-head,.cp-learning-flags{display:flex;justify-content:space-between;gap:3mm;}
  .cp-track-head em,.cp-learning-flags em{font-style:normal;font-size:8px;color:var(--muted);}
  .cp-output-stats small{display:block;font-size:9px;color:var(--muted);}
  .cp-resource-block small{display:block;font-size:8px;color:var(--accent-dark);margin-bottom:1.5mm;}
  .cp-resource-block ul{list-style:none;padding:0;margin:2mm 0 0;}
  .cp-resource-block li{display:flex;justify-content:space-between;gap:3mm;padding:1.5mm 0;border-bottom:1px dashed var(--line);font-size:9px;}
  .cp-resource-block li span{font-size:8px;color:var(--accent-dark);}
  .cp-learning-term,.cp-learning-footer button{display:none;}
  .cp-learning-card.is-selected{border-color:var(--accent);background:#fbf6fa;}
  .cp-learning-outcomes{color:#514a55!important;}

  /* 作品集/材料产出：圆形序号 + 右上角圆角标签，头部严格右对齐 */
  .cp-output-list{display:block;}
  .cp-output-card{display:grid;grid-template-columns:9mm minmax(0,1fr);gap:3.5mm;margin:0 0 3.5mm;padding:4.5mm;border:1px solid var(--line);border-radius:2px;background:#fff;break-inside:avoid;}
  .cp-output-index{display:grid;place-items:center;width:9mm;height:9mm;border-radius:50%;background:#f4eaf1;color:var(--accent-dark);font-size:9.5px;font-weight:700;}
  .cp-output-main{min-width:0;}
  .cp-output-head{display:flex;justify-content:space-between;align-items:flex-start;gap:3mm;}
  .cp-output-head h4{margin:0;font-size:11.5px;line-height:1.4;font-weight:700;color:var(--ink);}
  .cp-output-head .cd-chip,.cp-output-head span{flex:0 0 auto;padding:1.2mm 2mm;border:1px solid var(--line);border-radius:99px;font-size:8.5px;color:var(--accent-dark);background:#faf5fa;white-space:nowrap;}
  .cp-output-map{margin:2.5mm 0 0;padding-top:2.5mm;border-top:1px dashed var(--line);font-size:9.5px;line-height:1.6;color:#4d4550;}
  .cp-output-main ul{margin:1.5mm 0 0;padding-left:4mm;}
  .cp-output-main li{margin:0 0 1mm;font-size:9.5px;line-height:1.6;color:#403944;}

  /* 阶段执行路线图 */
  .cp-stage-table{border:1px solid var(--line);}
  .cp-stage-row{display:grid;grid-template-columns:25mm 1fr 1fr 1fr;break-inside:avoid;border-bottom:1px solid var(--line);}
  .cp-stage-row:last-child{border-bottom:0;}
  .cp-stage-row>*{padding:3mm;border-right:1px solid var(--line);min-width:0;}
  .cp-stage-row>*:last-child{border-right:0;}
  .cp-stage-row.head{background:var(--soft);color:var(--ink);font-size:9px;font-weight:700;}
  .cp-stage-row span b{font-size:9.5px;color:var(--ink);}
  .cp-stage-row span em{font-style:normal;display:block;font-size:8.5px;color:var(--accent-dark);margin-top:1mm;}
  .cp-stage-row p{margin:0;font-size:9.5px;line-height:1.55;color:#4e4752;}

  /* 申请要求与DDL总表（真实表格） */
  .cp-table-wrap{overflow:visible;}
  .cp-req-table{width:100%;border-collapse:collapse;table-layout:fixed;background:#fff;}
  .cp-req-table th{padding:3mm 2.5mm;background:var(--soft);color:var(--accent-dark);border-right:1px solid var(--line);border-bottom:1px solid var(--line);font-size:9.5px;line-height:1.4;text-align:left;}
  .cp-req-table th:last-child,.cp-req-table td:last-child{border-right:0;}
  .cp-req-table td{padding:3.2mm 2.5mm;border-right:1px solid var(--line);border-bottom:1px solid var(--line);vertical-align:top;color:#403944;font-size:9.5px;line-height:1.58;}
  .cp-req-table tr:last-child td{border-bottom:0;}
  .cp-req-table td b{display:block;color:var(--ink);font-size:10.5px;margin-bottom:1mm;}
  .cp-req-table td span,.cp-req-table td small{display:block;color:var(--muted);font-size:9px;}
  .cp-req-table td em{display:block;margin-bottom:1mm;font-size:8.3px;font-style:normal;color:var(--accent-dark);}
  .cp-candidate-note{font-size:9.5px;color:var(--muted);margin-top:3mm;}
  .cp-candidate-note li{display:flex;justify-content:space-between;border-bottom:1px dashed var(--line);padding:1mm 0;}

  /* 按月关键节点：左侧竖线 + 圆点时间轴 */
  .cp-timeline{position:relative;padding:1mm 0 0 9mm;}
  .cp-timeline:before{content:"";position:absolute;left:3mm;top:4mm;bottom:5mm;width:1px;background:linear-gradient(var(--accent),var(--line));}
  .cp-month{position:relative;display:block;padding:0 0 3mm;break-inside:avoid;}
  .cp-month:before{content:"";position:absolute;left:-7.6mm;top:2.8mm;width:3.2mm;height:3.2mm;border-radius:50%;background:#fff;border:1.2mm solid var(--accent);box-shadow:0 0 0 1mm #f6edf4;}
  .cp-month-time{padding-top:1.7mm;margin-bottom:1.5mm;font-size:10.5px;font-weight:700;color:var(--accent-dark);}
  .cp-month-body{display:block;}
  .cp-month-item{padding:2.8mm 4mm;margin-bottom:2mm;border:1px solid var(--line);border-radius:2mm;background:#fcfafb;}
  .cp-month-item:last-child{margin-bottom:0;}
  .cp-month-item h4{font-size:10.7px;line-height:1.5;margin:0 0 1.2mm;color:var(--ink);}
  .cp-month-item p{margin:0;font-size:9.6px;line-height:1.55;color:#4e4752;}
  .cp-task-type{display:inline-block;font-size:7.5px;line-height:1;padding:1.2mm 1.6mm;margin-right:2mm;border:1px solid rgba(157,79,132,.35);border-radius:99px;color:var(--accent-dark);background:#faf5fa;}
  .cp-overdue{font-size:7.5px;color:#9a4b3f;margin-right:2mm;}

  .cp-selected-programs{display:flex;flex-wrap:wrap;gap:2mm;margin-top:3mm;}
  .cp-selected-chip{border:1px solid var(--line);border-radius:99px;padding:1.2mm 3mm;font-size:8.5px;color:#514a55;}
  .cp-selected-chip button{display:none;}
  .pl-empty{padding:6mm 0;text-align:center;color:var(--muted);font-size:11px;}

  @page{size:A4;margin:10mm 0 12mm;}
  @media print{
    html,body{background:#fff;}
    body{padding:0;}
    .report-toolbar{display:none;}
    .report-document{width:auto;margin:0;box-shadow:none;}
    .report-cover{min-height:270mm;height:270mm;}
    .report-content{padding:8mm 17mm 0;}
    .report-footer{display:none;}
  }
`;

window.CareerPlanPage = CareerPlanPage;
