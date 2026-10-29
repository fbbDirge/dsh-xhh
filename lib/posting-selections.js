const cleanName = value => typeof value === "string" && value.trim().length > 0 && value === value.trim() && value.length <= 100 && !/[\x00-\x1f\x7f<>]/.test(value);
const validId = value => typeof value === "string" && /^[1-9]\d{0,19}$/.test(value);

export function validateSelections(communities, hashtags) {
  if (!Array.isArray(communities) || communities.length > 2 || communities.some(v => !v || !validId(v.id) || !cleanName(v.name)) || new Set(communities.map(v => v.id)).size !== communities.length) throw new Error("发帖分区最多 2 个，需有效社区 ID 和名称，且不能重复");
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
  const communities = [], hashtags = [];
  for (const item of items.slice(0, 200)) {
    if (!item || typeof item !== "object") continue;
    const rawName = item.name || item.title;
    const name = typeof rawName === "string" ? rawName.trim() : "";
    if (!cleanName(name)) continue;
    const id = typeof item.topic_id === "number" && !Number.isSafeInteger(item.topic_id) ? "" : String(item.topic_id ?? "");
    if (item.search_type === "topic" && validId(id) && !communities.some(v => v.id === id)) communities.push({ id, name });
    if (item.search_type === "hashtag" && !hashtags.some(v => v.name === name)) hashtags.push({ name, isActivity: item.is_act_hashtag === true || item.is_act_hashtag === 1 || item.is_act_hashtag === "1" });
  }
  return { communities, hashtags };
}
