import test from "node:test";
import assert from "node:assert/strict";
import { searchPostingSelections, resolveSelectionDecision, parseSelectionDecision } from "../lib/posting-selections.js";

test("editor search returns typed, deduplicated safe fields and preserves large IDs", async () => {
  const account = { cookie: "private-cookie" };
  const result = await searchPostingSelections(account, async (a, endpoint, params) => {
    assert.equal(a, account);
    assert.equal(endpoint, "/bbs/app/api/post_editor/topic_selection/search");
    assert.deepEqual(params, { web_version: "3.0", q: "游戏", only_hashtag: "0" });
    return { result: { search_result: [
      { search_type: "topic", topic_id: "12345678901234567890", title: "游戏讨论", private: "hidden" },
      { search_type: "topic", topic_id: "12345678901234567890", name: "重复" },
      { search_type: "hashtag", name: "话题一", is_act_hashtag: "0" },
      { search_type: "hashtag", name: "活动", is_act_hashtag: "1" },
      { search_type: "hashtag", name: "活动", is_act_hashtag: true },
      { search_type: "topic", topic_id: "bad", name: "无效 ID" },
      { search_type: "hashtag", name: "<script>" }, null,
    ] } };
  }, " 游戏 ");
  assert.deepEqual(result, { communities: [{ id: "12345678901234567890", name: "游戏讨论" }], hashtags: [{ name: "话题一", isActivity: false }, { name: "活动", isActivity: true }] });
});

test("empty query reads editor suggestions; malformed responses and queries fail", async () => {
  const result = await searchPostingSelections({}, async (_, endpoint, params) => {
    assert.equal(endpoint, "/bbs/app/api/post_editor/topic_selection/index");
    assert.deepEqual(params, { web_version: "3.0" });
    return { result: { topic_list: [{ topic_id: 7, name: "社区" }], hashtag_list: [{ name: "标签" }] } };
  });
  assert.deepEqual(result.communities, [{ id: "7", name: "社区" }]);
  assert.deepEqual(result.hashtags, [{ name: "标签", isActivity: false }]);
  for (const q of ["x".repeat(101), "bad\nquery", 7]) await assert.rejects(searchPostingSelections({}, () => assert.fail("must not query"), q));
  await assert.rejects(searchPostingSelections({}, async () => ({ result: { search_result: {} } }), "游戏"));
});


test("AI selection rejects fabricated targets, duplicate IDs and multiple activities", () => {
  const candidates = { communities: [{ id: "42", name: "游戏" }], hashtags: [{ name: "活动一", isActivity: true }, { name: "活动二", isActivity: true }] };
  assert.deepEqual(resolveSelectionDecision({ action: "send", communityIds: ["42"], hashtagNames: [] }, candidates).communities, candidates.communities);
  for (const value of [
    { action: "send", communityIds: [], hashtagNames: [] },
    { action: "send", communityIds: [42], hashtagNames: [] },
    { action: "send", communityIds: ["42", "42"], hashtagNames: [] },
    { action: "send", communityIds: ["42"], hashtagNames: ["活动一", "活动二"] },
    { action: "send", communityIds: ["42"], hashtagNames: ["活动一", "活动一"] },
  ]) assert.throws(() => resolveSelectionDecision(value, candidates));
  assert.deepEqual(parseSelectionDecision('```json\n{"action":"skip"}\n```'), { action: "skip" });
});
