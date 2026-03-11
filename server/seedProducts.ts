import { getUncachableStripeClient } from './stripeClient';

export async function seedStripeProducts() {
  try {
    const stripe = await getUncachableStripeClient();

    const existingBase = await stripe.products.search({ query: "name:'TradeFlow Individual'" });
    if (existingBase.data.length === 0) {
      console.log('Creating base TradeFlow Stripe products...');

      const individual = await stripe.products.create({
        name: 'TradeFlow Individual',
        description: 'Unlimited customers, jobs, quotes, and invoices for individual tradespeople. No team invites.',
        metadata: { plan: 'individual' },
      });
      await stripe.prices.create({
        product: individual.id,
        unit_amount: 2000,
        currency: 'usd',
        recurring: { interval: 'month' },
        metadata: { plan: 'individual' },
      });

      const smallBusiness = await stripe.products.create({
        name: 'TradeFlow Small Business',
        description: 'Unlimited everything with up to 25 team members for small businesses.',
        metadata: { plan: 'small_business' },
      });
      await stripe.prices.create({
        product: smallBusiness.id,
        unit_amount: 10000,
        currency: 'usd',
        recurring: { interval: 'month' },
        metadata: { plan: 'small_business' },
      });

      const enterprise = await stripe.products.create({
        name: 'TradeFlow Enterprise',
        description: 'Unlimited everything with unlimited team members for large businesses.',
        metadata: { plan: 'enterprise' },
      });
      await stripe.prices.create({
        product: enterprise.id,
        unit_amount: 20000,
        currency: 'usd',
        recurring: { interval: 'month' },
        metadata: { plan: 'enterprise' },
      });

      console.log('Base TradeFlow Stripe products created!');
    } else {
      console.log('Stripe products already exist, skipping seed...');
    }

    const existingCrProducts = await stripe.products.search({ query: "name:'Call Recovery Starter'" });
    if (existingCrProducts.data.length === 0) {
      console.log('Creating Call Recovery Stripe products...');

      const crStarter = await stripe.products.create({
        name: 'Call Recovery Starter',
        description: 'AI-powered missed call recovery with up to 50 recoveries per month.',
        metadata: { feature: 'call_recovery', plan: 'starter' },
      });
      await stripe.prices.create({
        product: crStarter.id,
        unit_amount: 2900,
        currency: 'usd',
        recurring: { interval: 'month' },
        metadata: { feature: 'call_recovery', plan: 'starter' },
      });

      const crGrowth = await stripe.products.create({
        name: 'Call Recovery Growth',
        description: 'AI-powered missed call recovery with unlimited recoveries per month.',
        metadata: { feature: 'call_recovery', plan: 'growth' },
      });
      await stripe.prices.create({
        product: crGrowth.id,
        unit_amount: 7900,
        currency: 'usd',
        recurring: { interval: 'month' },
        metadata: { feature: 'call_recovery', plan: 'growth' },
      });

      const crPro = await stripe.products.create({
        name: 'Call Recovery Pro',
        description: 'AI-powered missed call recovery with unlimited recoveries and analytics dashboard.',
        metadata: { feature: 'call_recovery', plan: 'pro' },
      });
      await stripe.prices.create({
        product: crPro.id,
        unit_amount: 14900,
        currency: 'usd',
        recurring: { interval: 'month' },
        metadata: { feature: 'call_recovery', plan: 'pro' },
      });

      console.log('Call Recovery Stripe products created successfully!');
    } else {
      console.log('Call Recovery Stripe products already exist, skipping...');
    }
  } catch (err: any) {
    console.error('Error seeding Stripe products:', err.message);
  }
}
