#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { DoorayClient } from "./dooray-client.js";
import { parseDoorayUrl } from "./utils/url-parser.js";

const client = new DoorayClient();

const server = new McpServer({
  name: "dooray",
  version: "1.0.0",
});

// Tool 1: get-my-info
server.tool(
  "get-my-info",
  "내 두레이 멤버 정보를 조회합니다 (이름, 이메일, ID 등)",
  {},
  async () => {
    const member = await client.getMyInfo();
    return {
      content: [{ type: "text", text: JSON.stringify(member, null, 2) }],
    };
  }
);

// Tool 2: get-projects
server.tool(
  "get-projects",
  "내가 속한 두레이 프로젝트 목록을 조회합니다",
  {
    state: z
      .string()
      .optional()
      .describe("프로젝트 상태 필터 (active, archived, deleted). 기본: active"),
    scope: z
      .string()
      .optional()
      .describe("프로젝트 범위 필터 (public, private)"),
  },
  async (args) => {
    const params: Record<string, string> = {};
    if (args.state) params.state = args.state;
    if (args.scope) params.scope = args.scope;

    const { result, totalCount } = await client.getProjects(params);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ totalCount, projects: result }, null, 2),
        },
      ],
    };
  }
);

// Tool 3: get-task
server.tool(
  "get-task",
  "두레이 업무(이슈)를 상세 조회합니다. 업무 ID, 두레이 URL, 또는 프로젝트ID+업무ID로 조회 가능합니다. 본문과 댓글도 함께 반환합니다.",
  {
    taskId: z.string().optional().describe("업무 ID (숫자)"),
    doorayUrl: z
      .string()
      .optional()
      .describe(
        "두레이 업무 URL (예: https://nhnent.dooray.com/project/123/posts/456)"
      ),
    projectId: z
      .string()
      .optional()
      .describe("프로젝트 ID (taskId와 함께 사용하면 본문 포함 조회)"),
  },
  async (args) => {
    let projectId = args.projectId;
    let postId = args.taskId;

    if (args.doorayUrl) {
      const parsed = parseDoorayUrl(args.doorayUrl);
      if (!parsed) {
        return {
          content: [
            { type: "text", text: `URL을 파싱할 수 없습니다: ${args.doorayUrl}` },
          ],
          isError: true,
        };
      }
      postId = parsed.postId;
      if (parsed.projectId) projectId = parsed.projectId;
    }

    if (!postId) {
      return {
        content: [
          { type: "text", text: "taskId 또는 doorayUrl 중 하나는 필수입니다." },
        ],
        isError: true,
      };
    }

    if (!projectId) {
      const basicPost = await client.getPostById(postId);
      projectId = basicPost.projectId;
      if (!projectId) {
        return {
          content: [
            { type: "text", text: JSON.stringify(basicPost, null, 2) },
          ],
        };
      }
    }

    const [post, logs] = await Promise.all([
      client.getPost(projectId, postId),
      client.getPostLogs(projectId, postId).catch(() => []),
    ]);

    const result = {
      task: post,
      comments: logs.filter(
        (log) => log.type === "comment" || log.body?.content
      ),
    };

    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

// Tool 4: get-task-list
server.tool(
  "get-task-list",
  "두레이 프로젝트의 업무 목록을 조회합니다. 상태, 담당자 등으로 필터링 가능합니다.",
  {
    projectId: z.string().describe("프로젝트 ID (필수)"),
    page: z.number().optional().describe("페이지 번호 (0부터 시작, 기본: 0)"),
    size: z.number().optional().describe("페이지 크기 (기본: 20, 최대: 100)"),
    postWorkflowClasses: z
      .string()
      .optional()
      .describe("업무 상태 필터 (쉼표 구분: registered, working, closed 등)"),
    toMemberIds: z
      .string()
      .optional()
      .describe("담당자 멤버 ID (쉼표 구분, 'me'로 본인 지정)"),
    order: z
      .string()
      .optional()
      .describe("정렬 기준 (예: createdAt, updatedAt)"),
    direction: z.string().optional().describe("정렬 방향 (asc 또는 desc)"),
  },
  async (args) => {
    const params: Record<string, string> = {};
    if (args.page !== undefined) params.page = String(args.page);
    if (args.size !== undefined) params.size = String(args.size);
    if (args.postWorkflowClasses)
      params.postWorkflowClasses = args.postWorkflowClasses;
    if (args.toMemberIds) params.toMemberIds = args.toMemberIds;
    if (args.order) params.order = args.order;
    if (args.direction) params.direction = args.direction;

    const { result, totalCount } = await client.getPosts(
      args.projectId,
      params
    );
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ totalCount, tasks: result }, null, 2),
        },
      ],
    };
  }
);

// Tool 5: create-daily-report
const DEFAULT_TEMPLATE = `## 오늘 할 일
- [ ]

## 어제 완료
- [x]

## 이슈 / 블로커
-
`;

server.tool(
  "create-daily-report",
  "오늘 날짜의 일일 업무 보고를 두레이 프로젝트에 생성합니다. 기본 템플릿 또는 커스텀 내용을 사용할 수 있습니다.",
  {
    projectId: z.string().describe("일일 업무를 생성할 프로젝트 ID (필수)"),
    customContent: z
      .string()
      .optional()
      .describe("커스텀 업무 내용 (미입력 시 기본 템플릿 사용)"),
  },
  async (args) => {
    const myInfo = await client.getMyInfo();

    const today = new Date();
    const dateStr = today.toISOString().split("T")[0];
    const subject = `[일일업무] ${dateStr} ${myInfo.name}`;
    const content = args.customContent || DEFAULT_TEMPLATE;

    const post = await client.createPost(args.projectId, {
      subject,
      body: {
        mimeType: "text/x-markdown",
        content,
      },
      toMemberIds: [myInfo.id],
    });

    const domain = client.getDomain();
    const taskUrl = `https://${domain}/project/${args.projectId}/posts/${post.id}`;

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              message: "일일 업무가 생성되었습니다.",
              subject,
              url: taskUrl,
              postId: post.id,
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Dooray MCP server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
