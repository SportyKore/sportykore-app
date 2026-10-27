import type { ApiStage } from "@/api/entities";
import {
  filterStageMatches,
  matchStageChoices,
  matchStages,
} from "../match-stage-filter";

const stage = (id: number, stageType: ApiStage["stageType"]): ApiStage => ({
  id,
  stageType,
  seasonId: 1,
  name: String(id),
  sequence: id,
  status: "active",
  config: {},
});
const games = [
  { stageId: 1 },
  { stageId: 2 },
  { stageId: 3 },
  { stageId: null },
  { stageId: null, tieId: 8 },
];

test("Swiss hides controls and ignores an incidental league or selected knockout", () => {
  const stages = [
    stage(1, "swiss"),
    stage(2, "round_robin"),
    stage(3, "knockout"),
  ];
  expect(matchStageChoices(stages)).toEqual([]);
  expect(filterStageMatches(games, stages, 2)).toEqual([games[0]]);
  expect(filterStageMatches(games, stages, 3)).toEqual([games[0]]);
});
test("multiple Swiss stages remain visible together without buttons", () => {
  const stages = [stage(1, "swiss"), stage(2, "swiss")];
  expect(filterStageMatches(games, stages, 1)).toEqual(games.slice(0, 2));
});
test("groups exclude incidental league stages and retain genuine stage choices", () => {
  const stages = [
    stage(1, "group"),
    stage(2, "group"),
    stage(3, "round_robin"),
  ];
  expect(matchStageChoices(stages).map((s) => s.id)).toEqual([1, 2]);
  expect(filterStageMatches(games, stages, 2)).toEqual([games[1]]);
});
test("league supports unlabelled legacy fixtures but excludes ties and other stages", () => {
  expect(
    filterStageMatches(
      games,
      [stage(1, "round_robin"), stage(3, "knockout")],
      1,
    ),
  ).toEqual([games[0], games[3]]);
});
test("knockout matches filter by stage and stale selection falls back", () => {
  const stages = [stage(1, "knockout"), stage(3, "knockout")];
  expect(filterStageMatches(games, stages, 3)).toEqual([games[2]]);
  expect(filterStageMatches(games, stages, 999)).toEqual([games[0]]);
});
test("no-stage seasons preserve legacy fixtures and repeated stages are deduplicated", () => {
  expect(filterStageMatches(games, [], null)).toEqual(games);
  expect(matchStages([stage(1, "group"), stage(1, "group")])).toHaveLength(1);
});
