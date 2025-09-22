// LaTeX 수식 처리 유틸리티

/**
 * LaTeX 수식을 KaTeX로 렌더링 가능한 형태로 변환
 * @param {string} text - 원본 텍스트
 * @returns {string} 변환된 텍스트
 */
export const processLatexInText = (text) => {
  if (!text) return text;

  // $...$ 내에 있는 LaTeX 수식을 정리
  const processedText = text.replace(/\$([^$]+)\$/g, (match, latex) => {
    let cleanedLatex = latex
      // |frac → \frac 치환
      .replace(/\|frac/g, '\\frac')

      // 곱셈 기호 처리
      .replace(/×/g, '\\times')

      // 나눗셈 기호 처리
      .replace(/÷/g, '\\div')

      // 괄호 불일치 처리
      .replace(/\\left\(/g, '(').replace(/\\right\)/g, ')')
      .replace(/\\left\[/g, '[').replace(/\\right\]/g, ']')
      .replace(/\\left\\{/g, '{').replace(/\\right\\}/g, '}')

      // 텍스트 처리
      .replace(/\\text\{([^}]*)\}/g, '\\text{$1}')
      .replace(/\\mathrm\{([^}]*)\}/g, '\\mathrm{$1}')
      .replace(/\\mathbf\{([^}]*)\}/g, '\\mathbf{$1}')
      .replace(/\\mathit\{([^}]*)\}/g, '\\mathit{$1}');

    return `$${cleanedLatex}$`;
  });

  return processedText;
};


/**
 * 특정 LaTeX 패턴을 수정
 * @param {string} text - 원본 텍스트
 * @returns {string} 수정된 텍스트
 */
export const fixCommonLatexErrors = (text) => {
  if (!text) return text;
  
  return text
    // 잘못된 분수 표현 수정
    .replace(/\|frac\{([^}]+)\}\{([^}]+)\}/g, '\\frac{$1}{$2}')
    .replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '\\frac{$1}{$2}')
    // 잘못된 곱하기 표현 수정
    .replace(/×/g, '\\times')
    .replace(/\\times\s*=/g, '\\times =')
    // 잘못된 등호 표현 수정
    .replace(/=\s*×/g, '= \\times')
    // 잘못된 괄호 표현 수정
    .replace(/\\left\(/g, '(')
    .replace(/\\right\)/g, ')')
    // 잘못된 텍스트 표현 수정
    .replace(/\\text\{([^}]+)\}/g, '\\text{$1}');
};

// 테스트 함수 추가
export const testLatexConversion = () => {
  const testCases = [
    // 사용자가 언급한 문제 케이스
    "$|frac{가H{3}× = 4$",
    "$\\frac{1}{3}x = 4$",
    "$x^2 + 2x + 1 = 0$",
    "$\\sqrt{16} = 4$",
    "$\\sin \\theta = \\frac{opposite}{hypotenuse}$",
    "$\\frac{1}{3} \\times 3 = 1$",
    "$\\frac{12}{3} = 4$",
    "$\\frac{1}{3} \\times (12) = 4$",
    "$(\\frac{1}{3}x) \\times 3 = 4 \\times 3$",
    "$\\frac{1}{3} \\times 3 \\times x = 1 \\times x = x$"
  ];
  
  console.log("=== LaTeX 변환 테스트 ===");
  testCases.forEach((testCase, index) => {
    const result = processLatexInText(testCase);
    console.log(`테스트 ${index + 1}:`);
    console.log(`  입력: ${testCase}`);
    console.log(`  출력: ${result}`);
    console.log("---");
  });
};
