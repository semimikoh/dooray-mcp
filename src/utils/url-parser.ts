export interface ParsedDoorayUrl {
  projectId?: string;
  postId: string;
}

/**
 * Parse Dooray URL to extract project ID and post ID.
 *
 * Supported formats:
 * - https://nhnent.dooray.com/task/{post-id}
 * - https://nhnent.dooray.com/project/{project-id}/posts/{post-id}
 * - Just a numeric post-id string
 */
export function parseDoorayUrl(input: string): ParsedDoorayUrl | null {
  // If it's just a numeric ID
  if (/^\d+$/.test(input.trim())) {
    return { postId: input.trim() };
  }

  try {
    const url = new URL(input);

    // /task/{post-id}
    const taskMatch = url.pathname.match(/\/task\/(\d+)/);
    if (taskMatch) {
      return { postId: taskMatch[1] };
    }

    // /project/{project-id}/posts/{post-id}
    const projectPostMatch = url.pathname.match(
      /\/project\/(\d+)\/posts\/(\d+)/
    );
    if (projectPostMatch) {
      return { projectId: projectPostMatch[1], postId: projectPostMatch[2] };
    }

    return null;
  } catch {
    return null;
  }
}
