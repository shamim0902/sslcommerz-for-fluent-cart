<?php

namespace SslcommerzFluentCart\Confirmations;

use FluentCart\App\Helpers\Status;
use FluentCart\App\Helpers\StatusHelper;
use FluentCart\App\Models\OrderTransaction;
use FluentCart\Framework\Support\Arr;
use SslcommerzFluentCart\API\SslcommerzAPI;
use SslcommerzFluentCart\Settings\SslcommerzSettingsBase;

defined('ABSPATH') || exit;

class SslcommerzConfirmations
{
    public function init()
    {
        add_action('fluent_cart/before_render_redirect_page', [$this, 'maybeConfirmPayment'], 10, 1);
    }

    /**
     * Confirm payment on redirect page
     */
    public function maybeConfirmPayment($data)
    {
        $isReceipt = Arr::get($data, 'is_receipt', false);
        $method = Arr::get($data, 'method', '');

        if ($isReceipt || $method !== 'sslcommerz') {
            return;
        }

        $transactionHash = Arr::get($data, 'trx_hash', '');

        // Check if payment was successful from SSL Commerz redirect.
        // phpcs:ignore WordPress.Security.NonceVerification.Missing -- Gateway redirect-back has no WP nonce; the payment is confirmed by re-validating val_id against the SSL Commerz API and binding it to this transaction's id/amount below.
        $status = Arr::get($_POST, 'status');
        // phpcs:ignore WordPress.Security.NonceVerification.Missing -- See note above.
        $valId = Arr::get($_POST, 'val_id');

        if (!$status || !$transactionHash) {
            return;
        }

        $transaction = OrderTransaction::query()
            ->where('uuid', $transactionHash)
            ->where('payment_method', 'sslcommerz')
            ->first();

        if (!$transaction || $transaction->status === Status::TRANSACTION_SUCCEEDED) {
            return;
        }

        // If status is success and we have validation ID, verify with SSL Commerz
        if (($status === 'VALID' || $status === 'VALIDATED') && $valId) {
            $this->verifyAndConfirmPayment($transaction, $valId);
        }

        fluent_cart_add_log('SSL Commerz Payment Return', 'Customer returned from SSL Commerz. Status: ' . $status, 'info', [
            'module_name' => 'order',
            'module_id'   => $transaction->order_id,
        ]);
    }

    /**
     * Verify and confirm payment
     */
    private function verifyAndConfirmPayment($transaction, $valId)
    {
        $settings = new SslcommerzSettingsBase();
        $mode = $settings->getMode();

        $api = new SslcommerzAPI();
        $vendorTransaction = $api->validation($valId, $mode);

        if (is_wp_error($vendorTransaction)) {
            return;
        }

        $status = Arr::get($vendorTransaction, 'status');

        if ($status !== 'VALID' && $status !== 'VALIDATED') {
            return;
        }

        // Security: bind the validated payment to THIS transaction. The redirect POST
        // (status/val_id) is browser-supplied and forgeable, so confirm that the val_id
        // we validated actually belongs to this transaction and matches the expected amount.
        $validationTranId = Arr::get($vendorTransaction, 'tran_id');
        if ($validationTranId != $transaction->uuid) {
            fluent_cart_add_log('SSL Commerz Confirmation Rejected', 'Transaction ID mismatch on return. Expected: ' . $transaction->uuid . ' Got: ' . $validationTranId, 'error', [
                'module_name' => 'order',
                'module_id'   => $transaction->order_id,
            ]);
            return;
        }

        $validatedTotal = $this->convertToCents(
            Arr::get($vendorTransaction, 'currency_amount', 0),
            Arr::get($vendorTransaction, 'currency_type')
        );

        if (abs($transaction->total - $validatedTotal) > 1) {
            fluent_cart_add_log('SSL Commerz Confirmation Rejected', 'Amount mismatch on return. Expected: ' . $transaction->total . ' Got: ' . $validatedTotal, 'error', [
                'module_name' => 'order',
                'module_id'   => $transaction->order_id,
            ]);
            return;
        }

        // Update transaction
        $updateData = [
            'status'           => Status::TRANSACTION_SUCCEEDED,
            'vendor_charge_id' => $valId,
            'total'            => $this->convertToCents(
                Arr::get($vendorTransaction, 'currency_amount', 0),
                Arr::get($vendorTransaction, 'currency_type')
            ),
            'card_brand'       => Arr::get($vendorTransaction, 'card_brand'),
        ];

        $cardNo = Arr::get($vendorTransaction, 'card_no');
        if ($cardNo) {
            $updateData['card_last_4'] = substr($cardNo, -4);
        }

        // Atomic guard: the IPN may confirm the same transaction concurrently. The WHERE
        // clause ensures exactly one path performs the success transition and the order sync.
        $marked = (bool) OrderTransaction::query()
            ->where('id', $transaction->id)
            ->where('status', '!=', Status::TRANSACTION_SUCCEEDED)
            ->update($updateData);

        if (!$marked) {
            return;
        }

        $transaction->fill($updateData);

        // Sync order status
        if ($transaction->order) {
            (new StatusHelper($transaction->order))->syncOrderStatuses($transaction);
        }

        fluent_cart_add_log('SSL Commerz Payment Confirmation', 'Payment confirmed on return. Val ID: ' . $valId, 'info', [
            'module_name' => 'order',
            'module_id'   => $transaction->order_id,
        ]);
    }

    /**
     * Convert amount to cents
     */
    private function convertToCents($amount, $currency)
    {
        $zeroDecimalCurrencies = ['JPY'];
        
        if (in_array(strtoupper($currency), $zeroDecimalCurrencies)) {
            return (int) round(floatval($amount));
        }

        return (int) round(floatval($amount) * 100);
    }
}

