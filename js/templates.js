/* ==================================================================
   프롬프트 양식 데이터
   - 새 양식은 이 배열에 항목만 추가하면 화면·프롬프트가 자동으로 만들어진다
   - field.type: text | textarea | select | chips(단일) | multi(여러 개)
   - context: true  → 학교급·학년·과목 공통 입력을 함께 받음
   - source: 'optional' | 'required' → 참고 자료(PDF 변환 결과 등) 첨부
   ================================================================== */
(function () {
  const LEVELS = ['초등 저학년', '초등 고학년', '중학생', '고등학생', '학부모', '교사·성인'];

  window.TEMPLATE_CATEGORIES = [
    { id: 'class',  name: '수업',      icon: '📚' },
    { id: 'eval',   name: '평가',      icon: '📝' },
    { id: 'work',   name: '업무',      icon: '🗂️' },
    { id: 'student',name: '학생 기록', icon: '🧑‍🎓' },
    { id: 'media',  name: '이미지·글', icon: '🎨' },
    { id: 'doc',    name: '자료 활용', icon: '📄' },
  ];

  window.TEMPLATES = [
    /* ---------------- 수업 ---------------- */
    {
      id: 'lesson-plan', cat: 'class', icon: '🗂️', name: '수업 지도안',
      desc: '단원·차시에 맞는 수업 흐름(도입-전개-정리)을 설계',
      context: true, source: 'optional',
      role: '당신은 2022 개정 교육과정을 깊이 이해하는 수업 설계 전문가입니다.',
      task: '아래 조건에 맞는 수업 지도안을 작성해 주세요.',
      fields: [
        { id: 'topic', label: '단원·주제', type: 'textarea', required: true, ph: '예: 광합성의 원리 / 비례식과 비례배분' },
        { id: 'goal', label: '학습 목표', type: 'textarea', ph: '비워 두면 AI가 제안해요' },
        { id: 'time', label: '수업 시간', type: 'chips', options: ['40분', '45분', '50분', '블록 타임(80~100분)'] },
        { id: 'method', label: '수업 방법', type: 'multi', options: ['강의식', '모둠 협력학습', '토의·토론', '프로젝트', '거꾸로 수업', '탐구·실험', '게임 활용', '에듀테크 활용'] },
        { id: 'extra', label: '추가 요청', type: 'textarea', ph: '예: 느린 학습자를 위한 보조 활동 포함' },
      ],
      rules: ['도입-전개-정리 단계별로 시간 배분을 적어 주세요.', '교사 발문과 예상 학생 반응을 포함해 주세요.', '형성평가 방법을 한 가지 이상 넣어 주세요.'],
      output: '단계·시간·교수학습 활동·자료 및 유의점 열이 있는 마크다운 표 + 아래에 판서 계획',
    },
    {
      id: 'worksheet', cat: 'class', icon: '✏️', name: '학습지·활동지',
      desc: '학생이 바로 풀 수 있는 학습지 문항과 활동',
      context: true, source: 'optional',
      role: '당신은 학생 눈높이에 맞춘 학습지를 잘 만드는 교사입니다.',
      task: '아래 조건에 맞는 학습지를 만들어 주세요.',
      fields: [
        { id: 'topic', label: '주제', type: 'textarea', required: true, ph: '예: 우리 동네 지도 읽기 / 분수의 덧셈' },
        { id: 'kind', label: '활동 종류', type: 'multi', options: ['개념 정리 빈칸', '그림·도표 해석', '생각 쓰기', '짝·모둠 활동', '실생활 적용', '자기 평가'] },
        { id: 'count', label: '문항 수', type: 'text', ph: '예: 6문항' },
        { id: 'level', label: '난이도', type: 'chips', options: ['기초', '보통', '심화', '수준별(기초+심화)'] },
        { id: 'extra', label: '추가 요청', type: 'textarea', ph: '예: A4 한 장 분량, 답안 따로' },
      ],
      rules: ['학생에게 하는 말투(~해 보세요)로 써 주세요.', '정답과 해설은 맨 끝에 따로 모아 주세요.'],
      output: '제목·학습 목표·문항 순서의 마크다운',
    },
    {
      id: 'reading', cat: 'class', icon: '📖', name: '지문·읽기 자료',
      desc: '수준에 맞는 설명문·이야기·대화문 만들기',
      context: true,
      role: '당신은 교육용 글을 쓰는 전문 작가입니다.',
      task: '수업에서 쓸 읽기 자료를 써 주세요.',
      fields: [
        { id: 'genre', label: '글 종류', type: 'chips', options: ['설명문', '논설문', '이야기·동화', '대화문·대본', '기사문', '편지'] },
        { id: 'topic', label: '주제·키워드', type: 'textarea', required: true, ph: '예: 미세 플라스틱이 바다 생물에 미치는 영향' },
        { id: 'length', label: '분량', type: 'text', ph: '예: 600자 내외, 4문단' },
        { id: 'reader', label: '읽을 대상', type: 'chips', options: LEVELS },
        { id: 'with', label: '함께 만들기', type: 'multi', options: ['어휘 풀이', '내용 확인 문제', '생각 넓히기 질문'] },
      ],
      rules: ['사실 정보는 정확하게 쓰고, 불확실한 수치는 쓰지 마세요.', '대상 학생이 모를 만한 어려운 한자어는 피해 주세요.'],
      output: '제목과 본문, 이어서 선택한 추가 자료',
    },

    /* ---------------- 평가 ---------------- */
    {
      id: 'quiz', cat: 'eval', icon: '❓', name: '평가 문항',
      desc: '선택형·서술형 문항과 정답·해설',
      context: true, source: 'optional',
      role: '당신은 타당도와 변별력을 고려해 문항을 만드는 평가 전문가입니다.',
      task: '아래 조건에 맞는 평가 문항을 만들어 주세요.',
      fields: [
        { id: 'topic', label: '평가 범위', type: 'textarea', required: true, ph: '예: 일차함수의 그래프와 기울기' },
        { id: 'type', label: '문항 유형', type: 'multi', options: ['5지선다', '단답형', '서술형', '논술형', 'O/X', '빈칸 채우기'] },
        { id: 'count', label: '문항 수', type: 'text', ph: '예: 선다형 5개, 서술형 2개' },
        { id: 'level', label: '난이도 구성', type: 'chips', options: ['쉬움 위주', '고르게(상·중·하)', '어려움 위주'] },
        { id: 'extra', label: '추가 요청', type: 'textarea', ph: '예: 실생활 맥락 문항 1개 포함' },
      ],
      rules: ['문항마다 정답, 해설, 출제 의도를 붙여 주세요.', '선택지는 길이와 형식을 비슷하게 맞추고 정답 위치를 고르게 섞어 주세요.', '"모두 고르시오"처럼 애매한 문항은 피해 주세요.'],
      output: '문항 목록 다음에 정답·해설 표',
    },
    {
      id: 'rubric', cat: 'eval', icon: '📏', name: '채점 기준표(루브릭)',
      desc: '수행평가·서술형 채점 기준과 수준별 예시',
      context: true,
      role: '당신은 과정 중심 평가를 설계하는 평가 전문가입니다.',
      task: '아래 과제의 채점 기준표를 만들어 주세요.',
      fields: [
        { id: 'task', label: '과제·문항 내용', type: 'textarea', required: true, ph: '예: 우리 지역 환경 문제 조사 보고서 쓰기' },
        { id: 'criteria', label: '평가 요소', type: 'text', ph: '예: 내용 정확성, 근거 제시, 표현력 (비우면 AI 제안)' },
        { id: 'levels', label: '수준 단계', type: 'chips', options: ['3단계(상·중·하)', '4단계', '5단계(A~E)'] },
        { id: 'score', label: '총점', type: 'text', ph: '예: 20점' },
      ],
      rules: ['수준별 기준은 관찰 가능한 행동으로 구체적으로 써 주세요.', '학생에게 보여 줄 수 있는 쉬운 말 버전도 함께 주세요.'],
      output: '평가 요소×수준 마크다운 표 + 수준별 학생 답안 예시',
    },

    /* ---------------- 업무 ---------------- */
    {
      id: 'notice', cat: 'work', icon: '✉️', name: '가정통신문·안내문',
      desc: '학부모·학생 대상 안내문 초안',
      role: '당신은 학교의 공식 안내문을 정중하고 알기 쉽게 쓰는 담당 교사입니다.',
      task: '아래 내용으로 안내문을 작성해 주세요.',
      fields: [
        { id: 'title', label: '안내 제목', type: 'text', required: true, ph: '예: 2학기 현장체험학습 안내' },
        { id: 'facts', label: '꼭 들어갈 내용', type: 'textarea', required: true, ph: '일시, 장소, 준비물, 회신 기한 등을 적어 주세요' },
        { id: 'reader', label: '받는 사람', type: 'chips', options: ['학부모', '학생', '학부모·학생', '교직원'] },
        { id: 'tone', label: '말투', type: 'chips', options: ['공식적·정중하게', '따뜻하고 부드럽게', '짧고 핵심만'] },
        { id: 'reply', label: '회신서', type: 'chips', options: ['필요 없음', '회신서 포함'] },
      ],
      rules: ['입력한 날짜·장소·금액은 바꾸지 말고 그대로 쓰세요.', '입력에 없는 사실은 지어내지 말고 [ ]로 빈칸을 남겨 주세요.'],
      output: '인사말-본문-맺음말 순서의 안내문 (필요하면 회신서)',
    },
    {
      id: 'official', cat: 'work', icon: '🏛️', name: '공문·기안문 초안',
      desc: '내부 결재·대외 공문의 본문 초안',
      role: '당신은 공문서 작성 규정(행정업무운영 편람)에 익숙한 교육행정 담당자입니다.',
      task: '아래 내용으로 공문 본문을 작성해 주세요.',
      fields: [
        { id: 'title', label: '제목', type: 'text', required: true, ph: '예: 2026학년도 독서교육 주간 운영 계획' },
        { id: 'related', label: '관련 근거', type: 'textarea', ph: '예: OO교육청 중등교육과-1234(2026.3.2.)' },
        { id: 'facts', label: '주요 내용', type: 'textarea', required: true, ph: '목적, 기간, 대상, 방법, 예산 등' },
        { id: 'kind', label: '문서 종류', type: 'chips', options: ['내부 결재', '대외 발송', '계획서', '결과 보고'] },
        { id: 'attach', label: '붙임 목록', type: 'text', ph: '예: 운영 계획서 1부.' },
      ],
      rules: ['항목 기호는 1. → 가. → 1) → 가) 순서로 써 주세요.', '날짜는 2026. 3. 2. 형식, 끝에 "끝." 표시를 붙여 주세요.', '입력에 없는 사실은 지어내지 말고 [ ]로 비워 두세요.'],
      output: '제목, 관련 근거, 본문, 붙임 순서의 공문 본문',
    },
    {
      id: 'minutes', cat: 'work', icon: '🗒️', name: '회의록 정리',
      desc: '메모·녹취를 깔끔한 회의록으로',
      source: 'required',
      role: '당신은 회의 내용을 정확하고 간결하게 정리하는 서기입니다.',
      task: '참고 자료의 회의 메모를 회의록으로 정리해 주세요.',
      fields: [
        { id: 'meeting', label: '회의 이름', type: 'text', ph: '예: 2학년 협의회' },
        { id: 'style', label: '정리 방식', type: 'chips', options: ['안건별 정리', '결정 사항 중심 요약', '발언자별 정리'] },
        { id: 'todo', label: '함께 정리', type: 'multi', options: ['할 일·담당자·기한', '다음 회의 안건', '미결 사항'] },
      ],
      rules: ['메모에 없는 내용은 추가하지 마세요.', '결정 사항과 논의 중인 사항을 구분해 주세요.'],
      output: '일시·참석자·안건·논의 내용·결정 사항 순서의 회의록',
    },
    {
      id: 'message', cat: 'work', icon: '💬', name: '메일·문자 다듬기',
      desc: '학부모·동료에게 보낼 메시지를 상황에 맞게',
      role: '당신은 학교 구성원과의 소통을 돕는 커뮤니케이션 전문가입니다.',
      task: '아래 상황에 맞는 메시지를 써 주세요.',
      fields: [
        { id: 'to', label: '받는 사람', type: 'chips', options: ['학부모', '동료 교사', '관리자', '외부 기관', '학생'] },
        { id: 'situation', label: '상황·하고 싶은 말', type: 'textarea', required: true, ph: '예: 과제 미제출이 3번째라 가정 협조를 부탁하고 싶어요' },
        { id: 'medium', label: '보낼 곳', type: 'chips', options: ['문자·알림장', '이메일', '메신저'] },
        { id: 'tone', label: '말투', type: 'chips', options: ['정중하게', '부드럽고 따뜻하게', '단호하지만 예의 있게'] },
      ],
      rules: ['상대가 불쾌하지 않도록 사실과 요청을 분명히 나눠 주세요.', '버전 2개를 주세요(짧은 것, 자세한 것).'],
      output: '바로 보낼 수 있는 메시지 2가지',
    },

    /* ---------------- 학생 기록 ---------------- */
    {
      id: 'record', cat: 'student', icon: '📋', name: '세특·행발 문구',
      desc: '관찰 내용을 학생부 기재 문장으로',
      privacy: true,
      role: '당신은 학교생활기록부 기재요령을 잘 아는 담임·교과 교사입니다.',
      task: '아래 관찰 내용을 바탕으로 학교생활기록부 문장을 작성해 주세요.',
      fields: [
        { id: 'area', label: '기재 영역', type: 'chips', options: ['교과 세특', '행동특성 및 종합의견', '창체(자율·동아리·진로)', '개인별 세특'] },
        { id: 'subject', label: '과목·활동명', type: 'text', ph: '예: 과학 / 독서토론 동아리' },
        { id: 'observe', label: '관찰한 내용', type: 'textarea', required: true, ph: '학생 이름 대신 "학생A"로 적어 주세요. 예: 탐구 보고서에서 변인 통제를 스스로 설계함, 모둠원 의견 조율' },
        { id: 'length', label: '분량', type: 'chips', options: ['300자 내외', '500자 내외', '1000자 내외'] },
      ],
      rules: ['관찰 내용에 없는 활동·성과는 절대 지어내지 마세요.', '"~함", "~임" 형태의 개조식 종결로 써 주세요.', '수상, 공인어학, 사교육 등 기재 금지 사항은 넣지 마세요.', '학생 이름은 쓰지 마세요.'],
      output: '문장 3가지 버전(강점 중심 / 성장 과정 중심 / 간결형)',
    },
    {
      id: 'counsel', cat: 'student', icon: '🤝', name: '상담 기록 정리',
      desc: '상담 메모를 객관적인 기록으로',
      privacy: true, source: 'optional',
      role: '당신은 학생 상담 기록을 객관적이고 신중하게 정리하는 상담 교사입니다.',
      task: '상담 메모를 상담 기록으로 정리해 주세요.',
      fields: [
        { id: 'memo', label: '상담 메모', type: 'textarea', required: true, ph: '이름·연락처 등 개인정보는 빼고 "학생A"로 적어 주세요' },
        { id: 'kind', label: '상담 유형', type: 'chips', options: ['학업', '진로', '교우 관계', '생활 습관', '학부모 상담'] },
        { id: 'need', label: '함께 정리', type: 'multi', options: ['후속 조치', '관찰할 점', '학부모 안내 문구'] },
      ],
      rules: ['추측이나 판단은 "~로 보임"처럼 구분해 쓰고, 사실과 섞지 마세요.', '진단명이나 낙인이 될 표현은 쓰지 마세요.'],
      output: '상담 일시·유형·주요 내용·학생 반응·후속 조치 표',
    },

    /* ---------------- 이미지·글 (쏙 프롬프트 생성기 확장) ---------------- */
    {
      id: 'image', cat: 'media', icon: '🖼️', name: '이미지 만들기',
      desc: '학습지 삽화·포스터·아이콘 그림 요청',
      context: true,
      role: '당신은 교육용 이미지를 그리는 일러스트레이터입니다.',
      task: '다음 조건에 맞는 이미지를 하나 만들어 주세요.',
      fields: [
        { id: 'desc', label: '무엇을 그릴까요', type: 'textarea', required: true, ph: '예: 비커에 담긴 물을 관찰하는 학생 / 조선시대 시장 풍경' },
        { id: 'purpose', label: '용도', type: 'select', options: ['학습지 삽화', 'PPT 슬라이드', '포스터·안내문', '카드뉴스', '아이콘·기호', '캐릭터·마스코트', '배경 이미지', '도식·다이어그램'] },
        { id: 'style', label: '그림 스타일', type: 'chips', options: ['귀여운 일러스트', '만화·카툰', '플랫 아이콘', '사진처럼 사실적', '수채화', '손그림·크레파스', '흑백 선화(색칠용)', '3D 렌더링', '인포그래픽', '픽셀아트'] },
        { id: 'mood', label: '색감·분위기', type: 'multi', options: ['밝고 화사한', '파스텔톤', '따뜻한', '차분한', '대비가 강한', '심플한', '흑백'] },
        { id: 'ratio', label: '비율', type: 'chips', options: ['정사각형 1:1', '가로 16:9', '가로 4:3', '세로 3:4', '세로 9:16'] },
        { id: 'text', label: '이미지 속 글자', type: 'text', ph: '비워 두면 글자 없이 그려요 (AI는 글자를 자주 틀려요)' },
      ],
      rules: ['한국 초·중·고 학생용 교육 이미지입니다. 선정적·폭력적 요소와 실제 브랜드 로고는 넣지 마세요.'],
      textRule: (v) => v.text ? `이미지 안에 다음 글자를 정확히 넣어 주세요: "${v.text}"` : '이미지 안에는 글자를 넣지 마세요.',
    },
    {
      id: 'infographic', cat: 'media', icon: '📊', name: '인포그래픽 (한 장 정리)',
      desc: '수업 내용을 그림 한 장으로 — 게시·인쇄·PPT용',
      context: true, source: 'optional',
      fields: [
        { id: 'mode', label: '만드는 방식', type: 'chips', options: ['이미지로 (재미나이·챗GPT)', '웹페이지로 (글자 정확·인쇄용)'] },
        { id: 'topic', label: '주제', type: 'text', required: true, ph: '예: 광합성 / 조선의 신분 제도 / 분수의 덧셈' },
        { id: 'points', label: '담을 내용', type: 'textarea', required: true, ph: '한 줄에 하나씩 적어 주세요.\n예: 빛·물·이산화탄소가 필요해요\n엽록체에서 일어나요\n포도당과 산소가 만들어져요' },
        { id: 'layout', label: '구성 방식', type: 'chips', options: ['과정·순서', '비교', '분류·구조', '원인과 결과', '시간의 흐름', '개념 + 예시', '숫자·통계'] },
        { id: 'reader', label: '보는 학생', type: 'chips', options: LEVELS.slice(0, 4) },
        { id: 'style', label: '그림 스타일', type: 'chips', options: ['귀여운 일러스트', '플랫 아이콘', '교과서 삽화', '칠판·분필', '스케치노트(손그림)', '3D 아이콘'] },
        { id: 'mood', label: '색감', type: 'multi', options: ['밝고 화사한', '파스텔톤', '차분한', '대비가 강한', '흑백(인쇄용)'] },
        { id: 'ratio', label: '크기', type: 'chips', options: ['세로 A4 (인쇄·게시용)', '가로 16:9 (PPT·TV용)', '정사각형 1:1'] },
        { id: 'textMode', label: '그림 속 글자', type: 'chips', options: ['짧은 한국어 낱말 (추천)', '글자 없이 그림만'] },
        { id: 'labels', label: '정확히 넣을 글자', type: 'textarea', ph: '제목과 낱말을 한 줄에 하나씩 (비우면 AI가 짧게 정해요)\n예: 광합성\n빛 에너지\n엽록체' },
        { id: 'extra', label: '추가 요청', type: 'textarea', ph: '예: 식물 캐릭터가 설명해 주는 느낌으로' },
      ],
      // 고른 방식에 따라 역할·요청·규칙을 바꾼다
      adapt(v) {
        const LAYOUT = {
          '과정·순서': '단계에 번호(①②③…)를 붙이고 화살표로 순서대로 이어 주세요.',
          '비교': '비교할 대상을 나란히 놓고, 같은 기준으로 서로 비교되게 해 주세요.',
          '분류·구조': '가운데 중심 개념에서 가지가 뻗어 나가는 구조(마인드맵)로 배치해 주세요.',
          '원인과 결과': '왼쪽에 원인, 오른쪽에 결과를 두고 화살표로 연결해 주세요.',
          '시간의 흐름': '가로 연표(타임라인) 위에 시기별 내용을 배치해 주세요.',
          '개념 + 예시': '가운데에 큰 개념 정의, 둘레에 생활 속 예시 그림들을 배치해 주세요.',
          '숫자·통계': '핵심 숫자를 크게 강조하고, 간단한 그래프나 아이콘 배열로 보여 주세요.',
        };
        const layout = LAYOUT[v.layout] || '내용에 가장 잘 맞는 구성(순서·비교·구조 등)을 골라 주세요.';
        const labels = (v.labels || '').split('\n').map(x => x.trim()).filter(Boolean);
        const common = [
          '맨 위에 큰 제목, 그 아래 3~6개 구역으로 나누고 아이콘·화살표·번호로 흐름이 한눈에 보이게 해 주세요.',
          layout,
          '긴 문장 대신 그림과 짧은 낱말로 표현해 주세요.',
          '내용은 교과서 수준에서 사실과 맞아야 해요. 틀리거나 지어낸 정보는 넣지 마세요.',
        ];
        if (/웹페이지/.test(v.mode || '')) {
          const size = /16:9/.test(v.ratio || '') ? '1280×720px' : /1:1/.test(v.ratio || '') ? '1080×1080px' : '794×1123px(A4 세로)';
          return {
            role: '당신은 학생 눈높이의 교육용 인포그래픽을 만드는 정보 디자이너이자 웹 개발자입니다.',
            task: '아래 수업 내용을 한 장짜리 인포그래픽 웹페이지(HTML)로 만들어 주세요.',
            rules: [
              `화면 ${size} 안에 딱 맞는 한 장으로 만들어 주세요.`,
              ...common,
              'HTML 파일 하나에 CSS를 모두 넣고, 외부 파일·인터넷 이미지는 쓰지 마세요. 그림은 이모지나 인라인 SVG로 그려 주세요.',
              '글씨는 크게(본문 18px 이상), 한 칸의 설명은 1~2줄로 짧게 써 주세요.',
              labels.length ? `제목·낱말은 다음을 맞춤법 그대로 써 주세요: ${labels.join(', ')}` : '',
              '인쇄했을 때 한 장에 잘리지 않게 @media print 설정을 넣어 주세요.',
            ].filter(Boolean),
            output: '설명 없이 완성된 HTML 코드 전체만 코드 블록 하나로 주세요. (Claude는 바로 미리보기가 되고, 챗GPT는 캔버스에서 미리 볼 수 있어요. 캡처하면 이미지로 쓸 수 있어요)',
          };
        }
        const noText = /글자 없이/.test(v.textMode || '');
        return {
          role: '당신은 학생들이 한눈에 이해할 수 있는 교육용 인포그래픽을 그리는 일러스트레이터이자 정보 디자이너입니다.',
          task: '아래 수업 내용을 인포그래픽 이미지 한 장으로 그려 주세요.',
          rules: [
            '이미지 한 장에 모든 내용을 담아 주세요.',
            ...common,
            noText ? '이미지 안에 글자를 넣지 마세요. 내용은 그림·기호·화살표만으로 표현해 주세요.'
              : labels.length ? `이미지 안의 글자는 다음 낱말만, 맞춤법 그대로 정확하게 써 주세요: ${labels.map(x => `"${x}"`).join(', ')}. 목록에 없는 글자는 넣지 마세요.`
                : '이미지 안의 글자는 한국어로, 제목과 핵심 낱말(2~8글자)만 크고 또렷하게, 맞춤법을 정확히 지켜 써 주세요.',
            '배경은 밝게, 여백은 넉넉히 두어 인쇄해도 잘 보이게 해 주세요.',
            '선정적·폭력적 요소와 실제 브랜드 로고는 넣지 마세요.',
          ],
          output: '완성된 이미지 한 장. 이미지 아래에 담은 내용을 2~3줄로 요약해 주세요.',
        };
      },
    },
    {
      id: 'content', cat: 'media', icon: '📝', name: '내용(글) 만들기',
      desc: '예시문·대화문·표·체크리스트 등 짧은 글',
      context: true,
      role: '당신은 수업 자료용 글을 쓰는 교육 콘텐츠 작가입니다.',
      task: '다음 조건에 맞는 내용을 만들어 주세요.',
      fields: [
        { id: 'type', label: '필요한 내용', type: 'select', options: ['예시 문장·예시 문제', '표·데이터', '대화문·역할극 대본', '설명문·요약', '체크리스트', '퀴즈', '이미지 캡션 문구'] },
        { id: 'topic', label: '주제·키워드', type: 'textarea', required: true, ph: '예: 분수의 덧셈 예시 문제 3개' },
        { id: 'length', label: '분량', type: 'text', ph: '예: 5개 항목, 표 5행' },
        { id: 'format', label: '출력 형식', type: 'chips', options: ['줄글', '목록', '번호 목록', '마크다운 표', '대화형'] },
        { id: 'reader', label: '대상', type: 'chips', options: LEVELS },
      ],
      rules: ['결과는 설명 없이 바로 복사해 쓸 수 있는 완성된 형태로만 주세요.'],
    },

    /* ---------------- 자료 활용 (PDF 변환과 연결) ---------------- */
    {
      id: 'summary', cat: 'doc', icon: '🔎', name: '문서 요약',
      desc: '긴 공문·계획서·논문을 핵심만',
      source: 'required',
      role: '당신은 긴 문서에서 핵심을 정확히 뽑아내는 분석가입니다.',
      task: '참고 자료를 요약해 주세요.',
      fields: [
        { id: 'style', label: '요약 방식', type: 'chips', options: ['3줄 요약', '항목별 개조식', '표로 정리', 'Q&A 형식'] },
        { id: 'focus', label: '특히 궁금한 점', type: 'textarea', ph: '예: 우리 학교가 해야 할 일과 기한만' },
        { id: 'reader', label: '읽을 사람', type: 'chips', options: ['나(교사)', '동료 교사', '학부모', '학생'] },
      ],
      rules: ['자료에 없는 내용은 덧붙이지 마세요.', '날짜·숫자·기한은 원문 그대로 옮겨 주세요.'],
    },
    {
      id: 'doc2class', cat: 'doc', icon: '🎯', name: '문서로 수업자료 만들기',
      desc: '교재·자료 내용으로 학습지·문제·활동 만들기',
      context: true, source: 'required',
      role: '당신은 주어진 자료를 수업 활동으로 바꾸는 수업 설계 전문가입니다.',
      task: '참고 자료의 내용으로 수업 자료를 만들어 주세요.',
      fields: [
        { id: 'make', label: '만들 것', type: 'multi', options: ['핵심 개념 정리', '빈칸 학습지', '선택형 문제', '서술형 문제', '토의 질문', '마인드맵 구조'] },
        { id: 'count', label: '분량', type: 'text', ph: '예: 문제 10개' },
        { id: 'extra', label: '추가 요청', type: 'textarea', ph: '예: 3장 내용만 사용' },
      ],
      rules: ['자료의 내용 범위를 벗어나지 마세요.', '정답과 해설은 맨 끝에 따로 모아 주세요.'],
    },
  ];
})();
