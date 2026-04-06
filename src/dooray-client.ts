const BASE_URL = "https://api.dooray.com";

export interface DoorayResponse<T> {
  header: {
    isSuccessful: boolean;
    resultCode: number;
    resultMessage: string;
  };
  result: T;
  totalCount?: number;
}

export interface MemberInfo {
  id: string;
  name: string;
  userCode: string;
  emailAddress: string;
  phoneNumber?: string;
  department?: string;
  externalEmailAddress?: string;
}

export interface Project {
  id: string;
  code: string;
  description?: string;
  state: string;
  scope: string;
  type: string;
  organizationMemberId?: string;
}

export interface Post {
  id: string;
  number?: number;
  subject: string;
  body?: {
    mimeType: string;
    content: string;
  };
  workflowClass?: string;
  workflowId?: string;
  priority?: string;
  createdAt?: string;
  updatedAt?: string;
  dueDate?: string;
  dueDateFlag?: boolean;
  users?: {
    to?: Array<{ type: string; member: { organizationMemberId: string; name?: string } }>;
    from?: { member: { organizationMemberId: string; name?: string } };
  };
  projectId?: string;
  tags?: Array<{ id: string; name: string }>;
  milestoneId?: string;
  parentPostId?: string;
}

export interface PostLog {
  id: string;
  type: string;
  content?: string;
  body?: {
    mimeType: string;
    content: string;
  };
  createdAt: string;
  creator?: {
    type: string;
    member?: { organizationMemberId: string; name?: string };
  };
}

export class DoorayClient {
  private token: string;
  private domain: string;

  constructor(token?: string, domain?: string) {
    this.token = token || process.env.DOORAY_API_TOKEN || "";
    this.domain = domain || process.env.DOORAY_DOMAIN || "nhnent.dooray.com";
    if (!this.token) {
      throw new Error("DOORAY_API_TOKEN is required");
    }
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    params?: Record<string, string>
  ): Promise<DoorayResponse<T>> {
    const url = new URL(`${BASE_URL}${path}`);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== "") {
          url.searchParams.set(key, value);
        }
      }
    }

    const headers: Record<string, string> = {
      Authorization: `dooray-api ${this.token}`,
      "Content-Type": "application/json",
    };

    const response = await fetch(url.toString(), {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      throw new Error(`Dooray API error ${response.status}: ${errorText}`);
    }

    const data = (await response.json()) as DoorayResponse<T>;
    if (!data.header.isSuccessful) {
      throw new Error(
        `Dooray API failed: ${data.header.resultMessage} (code: ${data.header.resultCode})`
      );
    }

    return data;
  }

  async getMyInfo(): Promise<MemberInfo> {
    const res = await this.request<MemberInfo>("GET", "/common/v1/members/me");
    return res.result;
  }

  async getProjects(
    params?: Record<string, string>
  ): Promise<{ result: Project[]; totalCount?: number }> {
    const defaultParams = { member: "me", state: "active", ...params };
    const res = await this.request<Project[]>(
      "GET",
      "/project/v1/projects",
      undefined,
      defaultParams
    );
    return { result: res.result, totalCount: res.totalCount };
  }

  async getPost(projectId: string, postId: string): Promise<Post> {
    const res = await this.request<Post>(
      "GET",
      `/project/v1/projects/${projectId}/posts/${postId}`
    );
    return res.result;
  }

  async getPostById(postId: string): Promise<Post> {
    const res = await this.request<Post>("GET", `/project/v1/posts/${postId}`);
    return res.result;
  }

  async getPostLogs(projectId: string, postId: string): Promise<PostLog[]> {
    const res = await this.request<PostLog[]>(
      "GET",
      `/project/v1/projects/${projectId}/posts/${postId}/logs`
    );
    return res.result;
  }

  async getPosts(
    projectId: string,
    params?: Record<string, string>
  ): Promise<{ result: Post[]; totalCount?: number }> {
    const res = await this.request<Post[]>(
      "GET",
      `/project/v1/projects/${projectId}/posts`,
      undefined,
      params
    );
    return { result: res.result, totalCount: res.totalCount };
  }

  async createPost(
    projectId: string,
    body: {
      subject: string;
      body: { mimeType: string; content: string };
      toMemberIds?: string[];
      priority?: string;
      dueDate?: string;
      dueDateFlag?: boolean;
      tagIds?: string[];
    }
  ): Promise<Post> {
    const res = await this.request<Post>(
      "POST",
      `/project/v1/projects/${projectId}/posts`,
      body
    );
    return res.result;
  }

  async updatePost(
    projectId: string,
    postId: string,
    body: {
      subject?: string;
      body?: { mimeType: string; content: string };
      toMemberIds?: string[];
      priority?: string;
      dueDate?: string;
      dueDateFlag?: boolean;
      tagIds?: string[];
    }
  ): Promise<Post> {
    const res = await this.request<Post>(
      "PUT",
      `/project/v1/projects/${projectId}/posts/${postId}`,
      body
    );
    return res.result;
  }

  async createPostComment(
    projectId: string,
    postId: string,
    body: { content: string; mimeType?: string }
  ): Promise<PostLog> {
    const res = await this.request<PostLog>(
      "POST",
      `/project/v1/projects/${projectId}/posts/${postId}/logs`,
      {
        body: {
          mimeType: body.mimeType || "text/x-markdown",
          content: body.content,
        },
      }
    );
    return res.result;
  }

  getDomain(): string {
    return this.domain;
  }
}
