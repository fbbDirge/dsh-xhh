const cleanName = value => typeof value === "string" && value.trim().length > 0 && value === value.trim() && value.length <= 100 && !/[\x00-\x1f\x7f<>]/.test(value);
const validId = value => typeof value === "string" && /^[1-9]\d{0,19}$/.test(value);

export function validateSelections(communities, hashtags) {
  if (!Array.isArray(communities) || communities.length > 2 || communities.some(v => !v || !validId(v.id) || !cleanName(v.name)) || new Set(communities.map(v => v.id)).size !== communities.length) throw new Error("发帖分区最多 2 个，需有效社区 ID 和名称，且不能重复");
  if (communities.length > 1 && communities.some(v => v.id === "7214")) throw new Error("盒友杂谈分区只能单独选择，不能与其他分区同时发布");
  if (!Array.isArray(hashtags) || hashtags.length > 5 || hashtags.some(v => !v || !cleanName(v.name) || typeof v.isActivity !== "boolean") || new Set(hashtags.map(v => v.name)).size !== hashtags.length) throw new Error("发帖话题最多 5 个，需有效名称和活动标记，且不能重复");
  if (hashtags.filter(v => v.isActivity).length > 1) throw new Error("活动话题最多选择 1 个");
}

// The editor calls communities "topic" and topic tags "hashtag".
export async function searchPostingSelections(account, api, query = "") {
  if (typeof query !== "string" || query.length > 100 || /[\x00-\x1f\x7f]/.test(query)) throw new Error("搜索词最多 100 字，不能包含控制字符");
  const q = query.trim();
  const response = await api(account, "/bbs/app/api/post_editor/topic_selection/" + (q ? "search" : "index"), { web_version: "3.0", ...(q ? { q, only_hashtag: "0" } : {}) });
  const result = response?.result;
  if (!q && !Array.isArray(result?.topic_list) && !Array.isArray(result?.hashtag_list)) throw new Error("平台返回的推荐列表无效");
  const items = q ? result?.search_result : [
    ...(Array.isArray(result?.topic_list) ? result.topic_list.map(v => ({ ...v, search_type: "topic" })) : []),
    ...(Array.isArray(result?.hashtag_list) ? result.hashtag_list.map(v => ({ ...v, search_type: "hashtag" })) : []),
  ];
  if (!Array.isArray(items) || !result) throw new Error("平台返回的分区或话题列表无效");
  let catalogUnavailable = false;
  if (!q) {
    try {
      const catalog = (await api(account, "/bbs/app/topic/categories", { web_version: "3.0" }))?.result;
      if (!catalog || (![catalog.latest_hot_topics, catalog.subscribed_topics, catalog.recommend_for_user_topics].some(v => Array.isArray(v?.children)) && !Array.isArray(catalog.categories))) throw new Error("invalid catalog");
      // Only walk documented category containers; never recurse into user/game metadata.
      const append = (node, depth = 0) => {
        if (!node || depth > 5 || items.length >= 2000) return;
        if (Array.isArray(node)) { for (const child of node.slice(0, 500)) append(child, depth + 1); return; }
        if (typeof node !== "object") return;
        if (node.topic_id !== undefined && node.valid !== 0 && node.valid !== "0") items.push({ ...node, search_type: "topic" });
        if (Array.isArray(node.children)) append(node.children, depth + 1);
      };
      for (const group of [catalog.subscribed_topics, catalog.latest_hot_topics, catalog.recommend_for_user_topics, catalog.categories]) append(group);
    } catch { catalogUnavailable = true; }
  }

  const communities = [], hashtags = [];
  for (const item of items.slice(0, 2000)) {
    if (!item || typeof item !== "object") continue;
    const rawName = item.name || item.title;
    const name = typeof rawName === "string" ? rawName.trim() : "";
    if (!cleanName(name)) continue;
    const id = typeof item.topic_id === "number" && !Number.isSafeInteger(item.topic_id) ? "" : String(item.topic_id ?? "");
    if (item.search_type === "topic" && validId(id) && !communities.some(v => v.id === id)) communities.push({ id, name });
    if (item.search_type === "hashtag" && !hashtags.some(v => v.name === name)) hashtags.push({ name, isActivity: item.is_act_hashtag === true || item.is_act_hashtag === 1 || item.is_act_hashtag === "1" });
  }
  return { communities, hashtags, ...(!q ? { catalogUnavailable } : {}) };
}

export function parseSelectionDecision(text) {
  const value = JSON.parse(text.trim().replace(/^```json\s*\n([\s\S]*?)\n```$/, "$1"));
  if (!value || !["send", "skip"].includes(value.action)) throw new Error("模型分区选择格式无效");
  if (value.action === "skip") return { action: "skip" };
  if (!Array.isArray(value.communityIds) || value.communityIds.length < 1 || value.communityIds.length > 2 || value.communityIds.some(v => !validId(v)) || new Set(value.communityIds).size !== value.communityIds.length || !Array.isArray(value.hashtagNames) || value.hashtagNames.length > 5 || value.hashtagNames.some(v => !cleanName(v)) || new Set(value.hashtagNames).size !== value.hashtagNames.length) throw new Error("模型分区或话题选择无效");
  return { action: "send", communityIds: value.communityIds, hashtagNames: value.hashtagNames };
}

export function resolveSelectionDecision(decision, candidates) {
  const parsed = parseSelectionDecision(JSON.stringify(decision));
  if (parsed.action === "skip") return parsed;
  const communities = parsed.communityIds.map(id => candidates.communities.find(v => v.id === id));
  const hashtags = parsed.hashtagNames.map(name => candidates.hashtags.find(v => v.name === name));
  if (communities.some(v => !v) || hashtags.some(v => !v)) throw new Error("模型选择了候选范围外的分区或话题");
  validateSelections(communities, hashtags);
  return { action: "send", communities, hashtags };
}
