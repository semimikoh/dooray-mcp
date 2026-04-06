#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { DoorayClient } from "./dooray-client.js";
import { parseDoorayUrl } from "./utils/url-parser.js";

const client = new DoorayClient();

// 프로젝트 별명 매핑 (별명 → 실제 프로젝트 코드/이름)
const PROJECT_ALIASES: Record<string, string[]> = {
  "cone-chain": ["cone-chain", "콘체인", "ccp"],
};

// 별명을 정규화: 입력값이 별명이면 대표 이름 반환
function resolveAlias(input: string): string[] {
  const lower = input.toLowerCase();
  for (const [canonical, aliases] of Object.entries(PROJECT_ALIASES)) {
    if (aliases.some((a) => a.toLowerCase() === lower) || canonical.toLowerCase() === lower) {
      return [canonical, ...aliases];
    }
  }
  return [input];
}

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
  "두레이 프로젝트의 업무 목록을 조회합니다. 프로젝트 이름(코드)이나 ID로 조회 가능하며, 상태/담당자 등으로 필터링 가능합니다.",
  {
    projectId: z.string().optional().describe("프로젝트 ID (projectName과 둘 중 하나 필수)"),
    projectName: z.string().optional().describe("프로젝트 이름 또는 코드 (예: cone-chain). 부분 일치 검색 지원"),
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
    let projectId = args.projectId;

    // 프로젝트 이름/별명으로 검색
    if (!projectId && args.projectName) {
      const { result: projects } = await client.getProjects();
      const names = resolveAlias(args.projectName);
      const found = projects.find((p) =>
        names.some(
          (name) =>
            p.code.toLowerCase().includes(name.toLowerCase()) ||
            (p.description || "").toLowerCase().includes(name.toLowerCase())
        )
      );
      if (!found) {
        return {
          content: [
            { type: "text", text: `프로젝트를 찾을 수 없습니다: "${args.projectName}"` },
          ],
          isError: true,
        };
      }
      projectId = found.id;
    }

    if (!projectId) {
      return {
        content: [
          { type: "text", text: "projectId 또는 projectName 중 하나는 필수입니다." },
        ],
        isError: true,
      };
    }

    const params: Record<string, string> = {};
    if (args.page !== undefined) params.page = String(args.page);
    if (args.size !== undefined) params.size = String(args.size);
    if (args.postWorkflowClasses)
      params.postWorkflowClasses = args.postWorkflowClasses;
    if (args.toMemberIds) {
      if (args.toMemberIds === "me") {
        const myInfo = await client.getMyInfo();
        params.toMemberIds = myInfo.id;
      } else {
        params.toMemberIds = args.toMemberIds;
      }
    }
    if (args.order) params.order = args.order;
    if (args.direction) params.direction = args.direction;

    const { result, totalCount } = await client.getPosts(
      projectId,
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

// Tool 5: update-task
server.tool(
  "update-task",
  "두레이 업무(이슈)를 수정합니다. 제목, 본문, 담당자 등을 변경할 수 있습니다.",
  {
    taskId: z.string().describe("업무 ID (숫자)"),
    projectId: z
      .string()
      .optional()
      .describe("프로젝트 ID (미입력 시 taskId로 자동 조회)"),
    subject: z.string().optional().describe("변경할 제목"),
    content: z
      .string()
      .optional()
      .describe("변경할 본문 내용 (markdown)"),
    toMemberIds: z
      .string()
      .optional()
      .describe("변경할 담당자 멤버 ID (쉼표 구분, 'me'로 본인 지정)"),
  },
  async (args) => {
    let projectId = args.projectId;

    if (!projectId) {
      const basicPost = await client.getPostById(args.taskId);
      projectId = basicPost.projectId;
      if (!projectId) {
        return {
          content: [
            { type: "text", text: "프로젝트 ID를 찾을 수 없습니다. projectId를 직접 지정해주세요." },
          ],
          isError: true,
        };
      }
    }

    const updateBody: Record<string, unknown> = {};
    if (args.subject) updateBody.subject = args.subject;
    if (args.content) {
      updateBody.body = { mimeType: "text/x-markdown", content: args.content };
    }
    if (args.toMemberIds) {
      let memberIds: string[];
      if (args.toMemberIds === "me") {
        const myInfo = await client.getMyInfo();
        memberIds = [myInfo.id];
      } else {
        memberIds = args.toMemberIds.split(",").map((id) => id.trim());
      }
      updateBody.toMemberIds = memberIds;
    }

    if (Object.keys(updateBody).length === 0) {
      return {
        content: [
          { type: "text", text: "수정할 내용이 없습니다. subject, content, toMemberIds 중 하나 이상을 지정해주세요." },
        ],
        isError: true,
      };
    }

    const updated = await client.updatePost(projectId, args.taskId, updateBody);

    const domain = client.getDomain();
    const taskUrl = `https://${domain}/project/${projectId}/posts/${args.taskId}`;

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              message: "업무가 수정되었습니다.",
              url: taskUrl,
              postId: args.taskId,
              updated: Object.keys(updateBody),
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

// Tool 6: add-comment
server.tool(
  "add-comment",
  "두레이 업무(이슈)에 댓글을 추가합니다.",
  {
    taskId: z.string().describe("업무 ID (숫자)"),
    projectId: z
      .string()
      .optional()
      .describe("프로젝트 ID (미입력 시 taskId로 자동 조회)"),
    content: z.string().describe("댓글 내용 (markdown)"),
  },
  async (args) => {
    let projectId = args.projectId;

    if (!projectId) {
      const basicPost = await client.getPostById(args.taskId);
      projectId = basicPost.projectId;
      if (!projectId) {
        return {
          content: [
            { type: "text", text: "프로젝트 ID를 찾을 수 없습니다. projectId를 직접 지정해주세요." },
          ],
          isError: true,
        };
      }
    }

    const comment = await client.createPostComment(projectId, args.taskId, {
      content: args.content,
    });

    const domain = client.getDomain();
    const taskUrl = `https://${domain}/project/${projectId}/posts/${args.taskId}`;

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              message: "댓글이 추가되었습니다.",
              url: taskUrl,
              postId: args.taskId,
              commentId: comment.id,
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

// Tool 7: create-daily-report

// 일일 진행 업무 섹션에서 뎁스2까지만 유지 (세부 항목 제거)
function trimDailyTasksToDepth2(content: string): string {
  const sections = content.split(/(?=## )/);
  return sections
    .map((section) => {
      if (!section.startsWith("## 일일 진행 업무")) return section;
      const lines = section.split("\n");
      const filtered = lines.filter((line) => {
        // 섹션 제목은 유지
        if (line.startsWith("## ")) return true;
        // 빈 줄 유지
        if (line.trim() === "") return true;
        // 리스트 아이템의 뎁스 판별: 들여쓰기 수준 확인
        const match = line.match(/^(\s*)\*/);
        if (!match) return true;
        const indent = match[1].length;
        // 뎁스1: indent 0, 뎁스2: indent 4, 뎁스3: indent 8+
        return indent < 8;
      });
      return filtered.join("\n");
    })
    .join("");
}

const DAILY_REPORT_PROJECT_ID = "4239250185816538712"; // II-CLDev-DLWL

server.tool(
  "create-daily-report",
  "오늘 날짜의 일일 업무 보고를 두레이 프로젝트(II-CLDev-DLWL)에 생성합니다. 가장 최근 일일보고를 기반으로, 일일 진행 업무는 뎁스2까지만 유지하고 나머지는 그대로 복사합니다.",
  {
    customContent: z
      .string()
      .optional()
      .describe("커스텀 업무 내용 (미입력 시 최근 보고서 기반으로 자동 생성)"),
  },
  async (args) => {
    const myInfo = await client.getMyInfo();

    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");
    const subject = `${yyyy}/${mm}/${dd} - ${myInfo.name} - AI FE개발 챕터 `;

    let content: string;

    if (args.customContent) {
      content = args.customContent;
    } else {
      // 가장 최근 일일보고 가져오기
      const { result: recentTasks } = await client.getPosts(
        DAILY_REPORT_PROJECT_ID,
        {
          toMemberIds: myInfo.id,
          order: "createdAt",
          direction: "desc",
          size: "5",
        }
      );

      const lastReport = recentTasks.find((t) =>
        t.subject.includes(myInfo.name)
      );

      if (!lastReport) {
        return {
          content: [
            {
              type: "text",
              text: "이전 일일보고를 찾을 수 없습니다.",
            },
          ],
          isError: true,
        };
      }

      // 본문 포함 조회
      const fullPost = await client.getPost(
        DAILY_REPORT_PROJECT_ID,
        lastReport.id
      );

      if (!fullPost.body?.content) {
        return {
          content: [
            {
              type: "text",
              text: "이전 일일보고의 본문을 가져올 수 없습니다.",
            },
          ],
          isError: true,
        };
      }

      content = trimDailyTasksToDepth2(fullPost.body.content);
    }

    const post = await client.createPost(DAILY_REPORT_PROJECT_ID, {
      subject,
      body: {
        mimeType: "text/x-markdown",
        content,
      },
      toMemberIds: [myInfo.id],
    });

    const domain = client.getDomain();
    const taskUrl = `https://${domain}/project/${DAILY_REPORT_PROJECT_ID}/posts/${post.id}`;

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              message: "일일 업무 보고가 생성되었습니다.",
              subject,
              url: taskUrl,
              postId: post.id,
              basedOn: args.customContent
                ? "커스텀 내용"
                : "최근 보고서 기반",
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
