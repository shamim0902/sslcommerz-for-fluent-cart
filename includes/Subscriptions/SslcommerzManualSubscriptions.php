<?php

namespace SslcommerzFluentCart\Subscriptions;

use FluentCart\App\Modules\PaymentMethods\Core\AbstractSubscriptionModule;

/**
 * Manual-invoice subscription module for SSLCommerz.
 *
 * This does not create or manage any remote subscription objects on
 * the SSLCommerz side. Renewals are handled entirely by FluentCart's
 * invoice scheduler and paid as normal one-time SSLCommerz charges.
 */
class SslcommerzManualSubscriptions extends AbstractSubscriptionModule
{
    // No extra behaviour required for manual-invoice subscriptions.
}

