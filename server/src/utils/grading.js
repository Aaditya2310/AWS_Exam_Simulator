export function computeResults(exam, questions, answers) {
  const domainStats = {};
  Object.keys(exam.domains).forEach((k) => (domainStats[k] = { correct: 0, total: 0 }));
  let correctCount = 0;

  const review = questions.map((q) => {
    const given = answers[q.id] || [];
    const correctSet = [...q.correct].sort().join(",");
    const givenSet = [...given].sort().join(",");
    const isCorrect = given.length > 0 && correctSet === givenSet;
    domainStats[q.domain].total += 1;
    if (isCorrect) {
      domainStats[q.domain].correct += 1;
      correctCount += 1;
    }
    return {
      id: q.id,
      domain: q.domain,
      q: q.q,
      opts: q.opts,
      correct: q.correct,
      exp: q.exp,
      given,
      isCorrect,
    };
  });

  const total = questions.length;
  const scaled = Math.round((correctCount / total) * 1000);
  const passed = scaled >= exam.passScore;

  return { correctCount, total, scaled, passed, domainStats, review };
}
