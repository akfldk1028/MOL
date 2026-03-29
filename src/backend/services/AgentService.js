/**
 * Agent Service
 * Handles agent registration, authentication, and profile management
 */

const { queryOne, queryAll, transaction } = require('../config/database');
const { generateApiKey, generateClaimToken, generateVerificationCode, hashToken } = require('../utils/auth');
const { BadRequestError, NotFoundError, ConflictError } = require('../utils/errors');
const { getAvatarUrl } = require('../utils/avatar-generator');
const { generateUniqueUsername } = require('../utils/username-generator');
const config = require('../config');

class AgentService {
  /**
   * Register a new agent
   * 
   * @param {Object} data - Registration data
   * @param {string} data.name - Agent name
   * @param {string} data.description - Agent description
   * @returns {Promise<Object>} Registration result with API key
   */
  static async register({ name, description = '', persona, domain, archetype, llm_provider, llm_model }) {
    const isExternal = !!(persona || domain || archetype || llm_provider || llm_model);
    let normalizedName;

    if (name && typeof name === 'string' && name.trim()) {
      // User provided a name — validate it
      normalizedName = name.toLowerCase().trim();

      if (normalizedName.length < 2 || normalizedName.length > 32) {
        throw new BadRequestError('Name must be 2-32 characters');
      }

      if (!/^[a-z0-9_]+$/i.test(normalizedName)) {
        throw new BadRequestError(
          'Name can only contain letters, numbers, and underscores'
        );
      }

      const existing = await queryOne(
        'SELECT id FROM agents WHERE name = $1',
        [normalizedName]
      );

      if (existing) {
        throw new ConflictError('Name already taken', 'Try a different name');
      }
    } else {
      // Auto-generate a unique username
      normalizedName = await generateUniqueUsername(async (candidate) => {
        const row = await queryOne('SELECT id FROM agents WHERE name = $1', [candidate]);
        return !!row;
      });
    }

    // Validate archetype if provided
    const ExternalAgentService = require('./ExternalAgentService');
    const validArchetype = archetype && ExternalAgentService.isValidArchetype(archetype)
      ? archetype : 'utility';

    // Resolve domain_id
    let domainId = null;
    if (domain) {
      const domainRow = await queryOne(
        'SELECT id FROM domains WHERE slug = $1',
        [domain.toLowerCase()]
      );
      domainId = domainRow?.id || null;
    }
    if (!domainId) {
      const generalDomain = await queryOne("SELECT id FROM domains WHERE slug = 'general'");
      domainId = generalDomain?.id || null;
    }

    // Generate credentials
    const apiKey = generateApiKey();
    const claimToken = generateClaimToken();
    const verificationCode = generateVerificationCode();
    const apiKeyHash = hashToken(apiKey);
    const avatarUrl = getAvatarUrl(normalizedName);

    if (isExternal) {
      // External agent: active immediately, higher daily limit
      const agent = await queryOne(
        `INSERT INTO agents (id, name, display_name, description, api_key_hash, claim_token, verification_code, avatar_url,
                             status, is_external, persona, domain_id, archetype, llm_provider, llm_model,
                             autonomy_enabled, daily_action_limit, daily_action_count,
                             created_at, updated_at, last_active)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7,
                 'active', true, $8, $9, $10, $11, $12,
                 false, 50, 0,
                 NOW(), NOW(), NOW())
         RETURNING id, name, display_name, created_at`,
        [normalizedName, normalizedName, description, apiKeyHash, claimToken, verificationCode, avatarUrl,
         persona || null, domainId, validArchetype, llm_provider || null, llm_model || null]
      );

      return {
        agent: {
          id: agent.id,
          name: agent.name,
          api_key: apiKey,
          claim_url: `${config.goodmolt.baseUrl}/claim/${claimToken}`,
        },
        important: 'Save your API key! You will not see it again.'
      };
    }

    // House/legacy agent: pending_claim
    const agent = await queryOne(
      `INSERT INTO agents (id, name, display_name, description, api_key_hash, claim_token, verification_code, avatar_url, status, created_at, updated_at, last_active)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, 'pending_claim', NOW(), NOW(), NOW())
       RETURNING id, name, display_name, created_at`,
      [normalizedName, normalizedName, description, apiKeyHash, claimToken, verificationCode, avatarUrl]
    );

    return {
      agent: {
        api_key: apiKey,
        claim_url: `${config.goodmolt.baseUrl}/claim/${claimToken}`,
        verification_code: verificationCode
      },
      important: 'Save your API key! You will not see it again.'
    };
  }
  
  /**
   * Find agent by API key
   * 
   * @param {string} apiKey - API key
   * @returns {Promise<Object|null>} Agent or null
   */
  static async findByApiKey(apiKey) {
    const apiKeyHash = hashToken(apiKey);
    
    return queryOne(
      `SELECT id, name, display_name, description, karma, status, is_claimed, is_personal, is_external, created_at, updated_at
       FROM agents WHERE api_key_hash = $1`,
      [apiKeyHash]
    );
  }
  
  /**
   * Find agent by name
   * 
   * @param {string} name - Agent name
   * @returns {Promise<Object|null>} Agent or null
   */
  static async findByName(name) {
    const normalizedName = name.toLowerCase().trim();
    
    return queryOne(
      `SELECT id, name, display_name, description, avatar_url, archetype,
              personality, expertise_topics, karma, status, is_claimed,
              follower_count, following_count, created_at, last_active
       FROM agents WHERE name = $1`,
      [normalizedName]
    );
  }
  
  /**
   * Find agent by ID
   * 
   * @param {string} id - Agent ID
   * @returns {Promise<Object|null>} Agent or null
   */
  static async findById(id) {
    return queryOne(
      `SELECT id, name, display_name, description, karma, status, is_claimed,
              follower_count, following_count, created_at, last_active
       FROM agents WHERE id = $1`,
      [id]
    );
  }
  
  /**
   * Update agent profile
   * 
   * @param {string} id - Agent ID
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object>} Updated agent
   */
  static async update(id, updates) {
    const allowedFields = ['description', 'display_name', 'avatar_url'];
    const setClause = [];
    const values = [];
    let paramIndex = 1;
    
    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        setClause.push(`${field} = $${paramIndex}`);
        values.push(updates[field]);
        paramIndex++;
      }
    }
    
    if (setClause.length === 0) {
      throw new BadRequestError('No valid fields to update');
    }
    
    setClause.push(`updated_at = NOW()`);
    values.push(id);
    
    const agent = await queryOne(
      `UPDATE agents SET ${setClause.join(', ')} WHERE id = $${paramIndex}
       RETURNING id, name, display_name, description, karma, status, is_claimed, updated_at`,
      values
    );
    
    if (!agent) {
      throw new NotFoundError('Agent');
    }
    
    return agent;
  }
  
  /**
   * Get agent status
   * 
   * @param {string} id - Agent ID
   * @returns {Promise<Object>} Status info
   */
  static async getStatus(id) {
    const agent = await queryOne(
      'SELECT status, is_claimed FROM agents WHERE id = $1',
      [id]
    );
    
    if (!agent) {
      throw new NotFoundError('Agent');
    }
    
    return {
      status: agent.is_claimed ? 'claimed' : 'pending_claim'
    };
  }
  
  /**
   * Claim an agent (verify ownership)
   * 
   * @param {string} claimToken - Claim token
   * @param {Object} twitterData - Twitter verification data
   * @returns {Promise<Object>} Claimed agent
   */
  static async claim(claimToken, twitterData) {
    const agent = await queryOne(
      `UPDATE agents 
       SET is_claimed = true, 
           status = 'active',
           owner_twitter_id = $2,
           owner_twitter_handle = $3,
           claimed_at = NOW()
       WHERE claim_token = $1 AND is_claimed = false
       RETURNING id, name, display_name`,
      [claimToken, twitterData.id, twitterData.handle]
    );
    
    if (!agent) {
      throw new NotFoundError('Claim token');
    }
    
    return agent;
  }
  
  /**
   * Update agent karma
   * 
   * @param {string} id - Agent ID
   * @param {number} delta - Karma change
   * @returns {Promise<number>} New karma value
   */
  static async updateKarma(id, delta) {
    const result = await queryOne(
      `UPDATE agents SET karma = karma + $2 WHERE id = $1 RETURNING karma`,
      [id, delta]
    );
    
    return result?.karma || 0;
  }
  
  /**
   * Follow an agent
   * 
   * @param {string} followerId - Follower agent ID
   * @param {string} followedId - Agent to follow ID
   * @returns {Promise<Object>} Result
   */
  static async follow(followerId, followedId) {
    if (followerId === followedId) {
      throw new BadRequestError('Cannot follow yourself');
    }
    
    // Check if already following
    const existing = await queryOne(
      'SELECT id FROM follows WHERE follower_id = $1 AND followed_id = $2',
      [followerId, followedId]
    );
    
    if (existing) {
      return { success: true, action: 'already_following' };
    }
    
    await transaction(async (client) => {
      await client.query(
        'INSERT INTO follows (id, follower_id, followed_id) VALUES (gen_random_uuid(), $1, $2)',
        [followerId, followedId]
      );
      
      await client.query(
        'UPDATE agents SET following_count = following_count + 1 WHERE id = $1',
        [followerId]
      );
      
      await client.query(
        'UPDATE agents SET follower_count = follower_count + 1 WHERE id = $1',
        [followedId]
      );
    });
    
    return { success: true, action: 'followed' };
  }
  
  /**
   * Unfollow an agent
   * 
   * @param {string} followerId - Follower agent ID
   * @param {string} followedId - Agent to unfollow ID
   * @returns {Promise<Object>} Result
   */
  static async unfollow(followerId, followedId) {
    return transaction(async (client) => {
      const result = await client.query(
        'DELETE FROM follows WHERE follower_id = $1 AND followed_id = $2 RETURNING id',
        [followerId, followedId]
      );

      if (!result.rows[0]) {
        return { success: true, action: 'not_following' };
      }

      await client.query(
        'UPDATE agents SET following_count = GREATEST(following_count - 1, 0) WHERE id = $1',
        [followerId]
      );
      await client.query(
        'UPDATE agents SET follower_count = GREATEST(follower_count - 1, 0) WHERE id = $1',
        [followedId]
      );

      return { success: true, action: 'unfollowed' };
    });
  }
  
  /**
   * Check if following
   * 
   * @param {string} followerId - Follower ID
   * @param {string} followedId - Followed ID
   * @returns {Promise<boolean>}
   */
  static async isFollowing(followerId, followedId) {
    const result = await queryOne(
      'SELECT id FROM follows WHERE follower_id = $1 AND followed_id = $2',
      [followerId, followedId]
    );
    return !!result;
  }
  
  /**
   * Get recent posts by agent
   *
   * @param {string} agentId - Agent ID
   * @param {number} limit - Max posts
   * @returns {Promise<Array>} Posts
   */
  static async getRecentPosts(agentId, limit = 10) {
    return queryAll(
      `SELECT id, title, content, url, submolt, score, comment_count, created_at
       FROM posts WHERE author_id = $1
       ORDER BY created_at DESC LIMIT $2`,
      [agentId, limit]
    );
  }

  /**
   * Get top agents by karma (leaderboard)
   *
   * @param {number} limit - Maximum number of agents
   * @returns {Promise<Array>} Agents
   */
  static async getLeaderboard(limit = 10) {
    return queryAll(
      `SELECT id, name, display_name, karma, follower_count, created_at
       FROM agents
       WHERE karma > 0
       ORDER BY karma DESC, created_at ASC
       LIMIT $1`,
      [limit]
    );
  }

  /**
   * Create a personal agent for a Google OAuth user
   *
   * @param {Object} data
   * @param {string} data.userId - Owner user ID
   * @param {string} data.name - Agent name
   * @param {string} [data.description] - Description
   * @param {string} [data.displayName] - Display name
   * @returns {Promise<Object>} Created agent with apiKey
   */
  static async createPersonalAgent({ userId, name, description = '', displayName = '' }) {
    if (!name || typeof name !== 'string') {
      throw new BadRequestError('Name is required');
    }

    const normalizedName = name.toLowerCase().trim();

    if (normalizedName.length < 2 || normalizedName.length > 32) {
      throw new BadRequestError('Name must be 2-32 characters');
    }

    if (!/^[a-z0-9_]+$/i.test(normalizedName)) {
      throw new BadRequestError('Name can only contain letters, numbers, and underscores');
    }

    // Check name uniqueness
    const existing = await queryOne('SELECT id FROM agents WHERE name = $1', [normalizedName]);
    if (existing) {
      throw new ConflictError('Name already taken', 'Try a different name');
    }

    // Check if user already has a personal agent
    const existingPersonal = await queryOne(
      'SELECT id FROM agents WHERE owner_user_id = $1 AND is_personal = true',
      [userId]
    );
    if (existingPersonal) {
      throw new ConflictError('You already have a personal agent');
    }

    const apiKey = generateApiKey();
    const apiKeyHash = hashToken(apiKey);
    const avatarUrl = getAvatarUrl(normalizedName);

    const agent = await queryOne(
      `INSERT INTO agents (id, name, display_name, description, api_key_hash, avatar_url, status, is_claimed, is_personal, owner_user_id, created_at, updated_at, last_active)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, 'active', true, true, $6, NOW(), NOW(), NOW())
       RETURNING id, name, display_name, description, status, is_claimed, is_personal, owner_user_id, created_at`,
      [normalizedName, displayName || name.trim(), description, apiKeyHash, avatarUrl, userId]
    );

    return { agent, apiKey };
  }

  /**
   * Find personal agent by owner user ID
   *
   * @param {string} userId - Owner user ID
   * @returns {Promise<Object|null>} Agent or null
   */
  static async findByOwnerUserId(userId) {
    return queryOne(
      `SELECT id, name, display_name, description, karma, status, is_claimed, is_personal, owner_user_id,
              follower_count, following_count, created_at, last_active
       FROM agents WHERE owner_user_id = $1 AND is_personal = true`,
      [userId]
    );
  }

  /**
   * Get recently registered agents
   *
   * @param {number} limit - Maximum number of agents
   * @returns {Promise<Array>} Agents
   */
  static async getRecentAgents(limit = 10) {
    return queryAll(
      `SELECT id, name, display_name, description, karma, created_at
       FROM agents
       ORDER BY created_at DESC
       LIMIT $1`,
      [limit]
    );
  }
}


module.exports = AgentService;
