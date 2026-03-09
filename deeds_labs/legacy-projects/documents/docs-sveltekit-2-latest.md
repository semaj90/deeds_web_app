# SvelteKit 2 - Server Routes and API Patterns

## API Route Structure

### Basic API Route (+server.ts)
```typescript
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, params, locals }) => {
  try {
    const data = await fetchData(params.id);

    if (!data) {
      return error(404, 'Not found');
    }

    return json(data);
  } catch (err) {
    console.error('GET error:', err);
    return error(500, 'Internal server error');
  }
};

export const POST: RequestHandler = async ({ request, params }) => {
  try {
    const body = await request.json();

    // Validate request body
    if (!body.name) {
      return error(400, 'Name is required');
    }

    const result = await createData(body);

    return json(result, { status: 201 });
  } catch (err) {
    console.error('POST error:', err);
    return error(500, 'Failed to create data');
  }
};
```

## Load Functions

### Page Server Load (+page.server.ts)
```typescript
import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ params, url, locals, depends }) => {
  // Mark dependencies for invalidation
  depends('app:user-data');

  try {
    // Server-only operations
    const user = await getUserById(params.id);

    if (!user) {
      return error(404, 'User not found');
    }

    // Filter sensitive data
    const safeUser = {
      id: user.id,
      name: user.name,
      email: user.email
      // Don't include password, etc.
    };

    return {
      user: safeUser,
      posts: await getUserPosts(user.id),
      settings: await getUserSettings(user.id)
    };
  } catch (err) {
    console.error('Load error:', err);
    return error(500, 'Failed to load user data');
  }
};
```

### Universal Load (+page.ts)
```typescript
import type { PageLoad } from './$types';
import { error } from '@sveltejs/kit';

export const load: PageLoad = async ({ params, fetch, parent }) => {
  try {
    // Access parent data
    const parentData = await parent();

    // Client-side fetch (works on both server and client)
    const response = await fetch(`/api/data/${params.id}`);

    if (!response.ok) {
      return error(response.status, 'Failed to fetch data');
    }

    const data = await response.json();

    return {
      data,
      parentData
    };
  } catch (err) {
    console.error('Universal load error:', err);
    return error(500, 'Load failed');
  }
};
```

## Form Actions

### Basic Form Actions (+page.server.ts)
```typescript
import type { Actions, PageServerLoad } from './$types';
import { fail, redirect } from '@sveltejs/kit';

export const actions: Actions = {
  // Default action
  default: async ({ request }) => {
    const formData = await request.formData();
    const name = formData.get('name')?.toString();
    const email = formData.get('email')?.toString();

    // Validation
    const errors: Record<string, string> = {};

    if (!name) {
      errors.name = 'Name is required';
    }

    if (!email) {
      errors.email = 'Email is required';
    } else if (!/^[^@]+@[^@]+\.[^@]+$/.test(email)) {
      errors.email = 'Invalid email format';
    }

    if (Object.keys(errors).length > 0) {
      return fail(400, { name, email, errors });
    }

    try {
      await createUser({ name, email });
      return { success: true, name, email };
    } catch (err) {
      return fail(500, { name, email, errors: { general: 'Failed to create user' } });
    }
  },

  // Named actions
  update: async ({ request }) => {
    const formData = await request.formData();
    const id = formData.get('id')?.toString();
    const name = formData.get('name')?.toString();

    if (!id || !name) {
      return fail(400, { errors: { general: 'Missing required fields' } });
    }

    try {
      await updateUser(id, { name });
      return { success: true, updated: true };
    } catch (err) {
      return fail(500, { errors: { general: 'Update failed' } });
    }
  }
};
```

## TypeScript Integration Best Practices

### Request Event Typing
```typescript
import type { RequestEvent } from '@sveltejs/kit';

// Extend for custom properties
interface CustomRequestEvent extends RequestEvent {
  params: {
    id: string;
    slug?: string;
  };
  locals: {
    user?: {
      id: string;
      role: string;
    };
  };
}

export const GET: RequestHandler = async ({ params, locals }: CustomRequestEvent) => {
  // params.id is now typed as string
  // locals.user is optional but typed
};
```

### Generic Response Types
```typescript
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    message: string;
    code?: string;
  };
  meta?: {
    total?: number;
    page?: number;
    timestamp: string;
  };
}

function createApiResponse<T>(data: T): ApiResponse<T> {
  return {
    success: true,
    data,
    meta: {
      timestamp: new Date().toISOString()
    }
  };
}

export const GET: RequestHandler = async ({ params }) => {
  const user = await getUser(params.id);
  const response = createApiResponse(user);
  return json(response);
};
```

## Advanced Patterns

### Middleware Pattern
```typescript
// lib/middleware.ts
import type { RequestHandler } from '@sveltejs/kit';
import { error } from '@sveltejs/kit';

export function withAuth(handler: RequestHandler): RequestHandler {
  return async (event) => {
    const token = event.request.headers.get('authorization');

    if (!token) {
      return error(401, 'Unauthorized');
    }

    try {
      const user = await verifyToken(token);
      event.locals.user = user;
      return handler(event);
    } catch (err) {
      return error(401, 'Invalid token');
    }
  };
}

// Usage in route
export const GET = withAuth(async ({ locals }) => {
  // locals.user is guaranteed to exist
  return json({ user: locals.user });
});
```

### Streaming Responses
```typescript
export const GET: RequestHandler = async ({ url }) => {
  const query = url.searchParams.get('q');

  if (!query) {
    return error(400, 'Query required');
  }

  const stream = new ReadableStream({
    start(controller) {
      searchDatabase(query, (result) => {
        const chunk = JSON.stringify(result) + '\n';
        controller.enqueue(new TextEncoder().encode(chunk));
      }).then(() => {
        controller.close();
      }).catch((err) => {
        controller.error(err);
      });
    }
  });

  return new Response(stream, {
    headers: {
      'content-type': 'application/x-ndjson',
      'cache-control': 'no-cache'
    }
  });
};
```

**Topics Covered**: server-routes, load-functions, form-actions, api-endpoints, request-event, typescript-integration

*Generated via Context7 MCP Integration - 2025-09-24*