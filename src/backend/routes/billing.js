/**
 * Billing Routes
 * /api/v1/billing/*
 * Stripe integration for subscriptions and credits
 */

const { Router } = require('express');
const { asyncHandler } = require('../middleware/errorHandler');
const { requireInternalSecret } = require('../middleware/auth');
const { success } = require('../utils/response');
const { BadRequestError, NotFoundError } = require('../utils/errors');
const { queryOne } = require('../config/database');

const router = Router();

// Stripe는 환경변수로 설정된 경우만 초기화
let stripe = null;
if (process.env.STRIPE_SECRET_KEY) {
  stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
}

// 가격 ID (Stripe Dashboard에서 설정)
const PRICE_IDS = {
  pro_monthly: process.env.STRIPE_PRICE_PRO_MONTHLY,
  enterprise_monthly: process.env.STRIPE_PRICE_ENTERPRISE_MONTHLY,
  agent_pro_monthly: process.env.STRIPE_PRICE_AGENT_PRO_MONTHLY,
  agent_enterprise_monthly: process.env.STRIPE_PRICE_AGENT_ENTERPRISE_MONTHLY,
};

// 티어별 크레딧 설정
const TIER_CREDITS = {
  free: 5,
  pro: 50,
  enterprise: 999999, // effectively unlimited
};

/**
 * GET /billing/status
 * Get user's billing status (tier, credits, subscription info)
 */
router.get('/status', requireInternalSecret, asyncHandler(async (req, res) => {
  const userId = req.headers['x-user-id'];
  if (!userId) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }

  const user = await queryOne(
    `SELECT id, tier, credits_remaining, credit_reset_at, stripe_customer_id, stripe_subscription_id
     FROM users WHERE id = $1`,
    [userId]
  );

  if (!user) throw new NotFoundError('User not found');

  // 크레딧 리셋 확인 (월 1회)
  const now = new Date();
  const resetAt = user.credit_reset_at ? new Date(user.credit_reset_at) : null;
  if (!resetAt || now > resetAt) {
    const maxCredits = TIER_CREDITS[user.tier] || TIER_CREDITS.free;
    const nextReset = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    await queryOne(
      `UPDATE users SET credits_remaining = $1, credit_reset_at = $2 WHERE id = $3`,
      [maxCredits, nextReset, userId]
    );
    user.credits_remaining = maxCredits;
    user.credit_reset_at = nextReset;
  }

  success(res, {
    billing: {
      tier: user.tier,
      creditsRemaining: user.credits_remaining,
      creditResetAt: user.credit_reset_at,
      hasSubscription: !!user.stripe_subscription_id,
    },
  });
}));

/**
 * POST /billing/checkout
 * Create a Stripe Checkout session for subscription
 */
router.post('/checkout', requireInternalSecret, asyncHandler(async (req, res) => {
  if (!stripe) throw new BadRequestError('Billing not configured');

  const userId = req.headers['x-user-id'];
  if (!userId) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }

  const { plan } = req.body; // 'pro' or 'enterprise'
  const priceId = PRICE_IDS[`${plan}_monthly`];
  if (!priceId) throw new BadRequestError('Invalid plan');

  const user = await queryOne('SELECT id, email, stripe_customer_id FROM users WHERE id = $1', [userId]);
  if (!user) throw new NotFoundError('User not found');

  // Stripe 고객 ID 확인 또는 생성
  let customerId = user.stripe_customer_id;
  if (!customerId) {
    const customer = await stripe.customers.create({ email: user.email, metadata: { userId } });
    customerId = customer.id;
    await queryOne('UPDATE users SET stripe_customer_id = $1 WHERE id = $2', [customerId, userId]);
  }

  // Checkout 세션 생성
  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${process.env.GOODMOLT_FRONTEND_URL || 'https://www.goodmolt.app'}/dashboard?billing=success`,
    cancel_url: `${process.env.GOODMOLT_FRONTEND_URL || 'https://www.goodmolt.app'}/dashboard?billing=cancelled`,
    metadata: { userId, plan },
  });

  success(res, { checkoutUrl: session.url });
}));

/**
 * POST /billing/portal
 * Create a Stripe Customer Portal session
 */
router.post('/portal', requireInternalSecret, asyncHandler(async (req, res) => {
  if (!stripe) throw new BadRequestError('Billing not configured');

  const userId = req.headers['x-user-id'];
  if (!userId) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }

  const user = await queryOne('SELECT stripe_customer_id FROM users WHERE id = $1', [userId]);
  if (!user?.stripe_customer_id) throw new BadRequestError('No billing account');

  const session = await stripe.billingPortal.sessions.create({
    customer: user.stripe_customer_id,
    return_url: `${process.env.GOODMOLT_FRONTEND_URL || 'https://www.goodmolt.app'}/dashboard`,
  });

  success(res, { portalUrl: session.url });
}));

/**
 * POST /billing/webhook
 * Stripe webhook handler
 */
router.post('/webhook', asyncHandler(async (req, res) => {
  if (!stripe) {
    return res.status(200).json({ received: true });
  }

  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).json({ error: 'Invalid signature' });
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      const { userId, plan } = session.metadata;
      if (userId && plan) {
        const maxCredits = TIER_CREDITS[plan] || TIER_CREDITS.free;
        const nextReset = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1);
        await queryOne(
          `UPDATE users SET tier = $1, credits_remaining = $2, credit_reset_at = $3,
                           stripe_subscription_id = $4 WHERE id = $5`,
          [plan, maxCredits, nextReset, session.subscription, userId]
        );
      }
      break;
    }

    case 'customer.subscription.updated': {
      const subscription = event.data.object;
      // 구독 상태 변경 처리
      if (subscription.status === 'active') {
        const customer = await stripe.customers.retrieve(subscription.customer);
        const userId = customer.metadata?.userId;
        if (userId) {
          // price에서 plan 추출
          const priceId = subscription.items.data[0]?.price?.id;
          let plan = 'free';
          if (priceId === PRICE_IDS.pro_monthly) plan = 'pro';
          else if (priceId === PRICE_IDS.enterprise_monthly) plan = 'enterprise';

          const maxCredits = TIER_CREDITS[plan] || TIER_CREDITS.free;
          await queryOne(
            `UPDATE users SET tier = $1, credits_remaining = GREATEST(credits_remaining, $2),
                             stripe_subscription_id = $3 WHERE id = $4`,
            [plan, maxCredits, subscription.id, userId]
          );
        }
      }
      break;
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object;
      const customer = await stripe.customers.retrieve(subscription.customer);
      const userId = customer.metadata?.userId;
      if (userId) {
        await queryOne(
          `UPDATE users SET tier = 'free', credits_remaining = $1,
                           stripe_subscription_id = NULL WHERE id = $2`,
          [TIER_CREDITS.free, userId]
        );
      }
      break;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object;
      // 결제 실패 시 알림 (나중에 이메일 연동 가능)
      console.warn('Payment failed for customer:', invoice.customer);
      break;
    }
  }

  res.status(200).json({ received: true });
}));

module.exports = router;
