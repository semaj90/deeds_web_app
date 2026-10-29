/**
 * Who is physically who. Several story actors can be played by one scene character: the jester is Alice wearing the
 * jester costume, so `alice` and `jester` both drive the one `defense` mesh. The binding makes that explicit, and the
 * lock makes sure two story actors never steer the same transform at once: while an actor holds an entity (for example
 * mid-walk), another actor's move or animation for it is rejected with a conflict receipt, not applied on top.
 */
export interface CourtroomActorBinding {
	/** The physical character (one mesh, one transform). */
	entityId: string;
	/** The role the story gave this actor. */
	storyRole: string;
	/** The scene character that plays it. */
	sceneRole: string;
	/** Which look is worn while this actor is in control. */
	appearanceId: string;
}

export function bindActor(actor: { id: string; role: string }): CourtroomActorBinding {
	const sceneRole = actor.role === 'jester' ? 'defense' : actor.role;
	return {
		entityId: sceneRole,
		storyRole: actor.role,
		sceneRole,
		appearanceId: actor.role === 'jester' ? 'alice-with-jester-accessories' : `alice-as-${sceneRole}`,
	};
}

export interface ConflictReceipt {
	entityId: string;
	requester: string;
	owner: string;
	action: 'move' | 'animation';
	reason: 'ENTITY_HELD_BY_OTHER_ACTOR';
}

export type LockResult = { ok: true } | { ok: false; receipt: ConflictReceipt };

/** One holder per entity. The holder may repeat its own commands; anyone else is refused until it releases. */
export class EntityLocks {
	private readonly holders = new Map<string, string>();

	acquire(entityId: string, actorId: string, action: ConflictReceipt['action']): LockResult {
		const owner = this.holders.get(entityId);
		if (owner && owner !== actorId) {
			return { ok: false, receipt: { entityId, requester: actorId, owner, action, reason: 'ENTITY_HELD_BY_OTHER_ACTOR' } };
		}
		this.holders.set(entityId, actorId);
		return { ok: true };
	}

	/** Check without taking the lock (animations by a non-holder are refused while another actor holds the entity). */
	check(entityId: string, actorId: string, action: ConflictReceipt['action']): LockResult {
		const owner = this.holders.get(entityId);
		if (owner && owner !== actorId) {
			return { ok: false, receipt: { entityId, requester: actorId, owner, action, reason: 'ENTITY_HELD_BY_OTHER_ACTOR' } };
		}
		return { ok: true };
	}

	/** Only the holder can release; returns whether anything was released. */
	release(entityId: string, actorId: string): boolean {
		if (this.holders.get(entityId) !== actorId) return false;
		this.holders.delete(entityId);
		return true;
	}

	holder(entityId: string): string | null {
		return this.holders.get(entityId) ?? null;
	}

	clear(): void {
		this.holders.clear();
	}
}
