import assert from "node:assert/strict"
import test from "node:test"

import { parseCsvQuestionsForDrafts } from "./csv-question-import.ts"

test("parses valid MCQ rows into question drafts", () => {
  const csv = [
    "question,option1,option2,option3,option4,correct_option,explanation,difficulty,topic,subtopic",
    '"What is 2, plus 2?",3,4,5,6,B,"Because 2 + 2 = 4",hard,topic-2,sub-2',
    "Capital of India?,Delhi,Mumbai,Kolkata,Chennai,option1,,easy,,",
  ].join("\n")

  const result = parseCsvQuestionsForDrafts(csv, {
    difficulty: "medium",
    topic: "topic-1",
    subTopic: "sub-1",
  })

  assert.equal(result.drafts.length, 2)
  assert.deepEqual(result.errors, [])
  assert.equal(result.drafts[0].question, "What is 2, plus 2?")
  assert.equal(result.drafts[0].options.option2, "4")
  assert.equal(result.drafts[0].correctOption, "option2")
  assert.equal(result.drafts[0].explanation, "Because 2 + 2 = 4")
  assert.equal(result.drafts[0].difficulty, "hard")
  assert.equal(result.drafts[0].topic, "topic-2")
  assert.equal(result.drafts[0].subTopic, "sub-2")
  assert.equal(result.drafts[1].difficulty, "easy")
  assert.equal(result.drafts[1].topic, "topic-1")
  assert.equal(result.drafts[1].subTopic, "sub-1")
})

test("reports row-level errors and skips invalid CSV rows", () => {
  const csv = [
    "question,option1,option2,correct_option",
    "Missing correct,Yes,No,option3",
    ",Yes,No,option1",
    "Valid row,Yes,No,2",
  ].join("\n")

  const result = parseCsvQuestionsForDrafts(csv, {
    difficulty: "easy",
    topic: "topic-1",
    subTopic: "sub-1",
  })

  assert.equal(result.drafts.length, 1)
  assert.equal(result.drafts[0].correctOption, "option2")
  assert.equal(result.errors.length, 2)
  assert.equal(result.errors[0].row, 2)
  assert.match(result.errors[0].message, /Correct option/)
  assert.equal(result.errors[1].row, 3)
  assert.match(result.errors[1].message, /Question/)
})

test("rejects files without the required headers", () => {
  const result = parseCsvQuestionsForDrafts("title,a,b,answer\nSample,A,B,A", {
    difficulty: "easy",
    topic: "topic-1",
    subTopic: "sub-1",
  })

  assert.equal(result.drafts.length, 0)
  assert.equal(result.errors.length, 1)
  assert.equal(result.errors[0].row, 1)
  assert.match(result.errors[0].message, /Missing required headers/)
})
