# Dooray MCP Server

[Dooray](https://dooray.com) 프로젝트 관리 서비스를 Claude Code에서 사용할 수 있는 MCP(Model Context Protocol) 서버입니다.

## 기능

| 도구 | 설명 |
|------|------|
| `get-my-info` | 내 두레이 멤버 정보 조회 |
| `get-projects` | 내가 속한 프로젝트 목록 조회 |
| `get-task` | 업무(이슈) 상세 조회 (URL, ID 지원, 댓글 포함) |
| `get-task-list` | 프로젝트 업무 목록 조회 (상태/담당자 필터링) |
| `create-daily-report` | 일일 업무 보고 자동 생성 (마크다운 템플릿) |

## 설치

```bash
git clone https://github.com/semimikoh/dooray-mcp.git
cd dooray-mcp
npm install
npm run build
```

## Dooray API 토큰 발급

두레이 → 설정 → API 토큰에서 발급받으세요.

## Claude Code에 등록

```bash
claude mcp add dooray -s user \
  -e DOORAY_API_TOKEN=your-token \
  -e DOORAY_DOMAIN=nhnent.dooray.com \
  -- node /path/to/dooray-mcp/dist/index.js
```

## 사용 예시

Claude Code에서 자연어로 말하면 됩니다:

```
"내 두레이 정보 알려줘"
"두레이 프로젝트 목록 보여줘"
"이 이슈 분석해줘: https://nhnent.dooray.com/project/123/posts/456"
"프로젝트 XXX의 진행중인 업무 목록 보여줘"
"오늘 일일업무 만들어줘, 프로젝트 ID는 XXX"
```

## 일일업무 기본 템플릿

`create-daily-report` 사용 시 아래 템플릿으로 업무가 생성됩니다:

```markdown
## 오늘 할 일
- [ ]

## 어제 완료
- [x]

## 이슈 / 블로커
-
```

## 기술 스택

- TypeScript
- [MCP SDK](https://github.com/modelcontextprotocol/sdk) (stdio transport)
- Zod (입력 검증)
- Dooray REST API
