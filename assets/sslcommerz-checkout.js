class SslcommerzCheckout {
    constructor(form, orderHandler, response, paymentLoader) {
        this.form = form;
        this.orderHandler = orderHandler;
        this.data = response;
        this.paymentArgs = response?.payment_args || {};
        this.intent = response?.intent || {};
        this.paymentLoader = paymentLoader;
        this.currentOrderData = null;
        this.$t = this.translate.bind(this);
        this.submitButton = window.fluentcart_checkout_vars?.submit_button;
    }

    translate(string) {
        const translations = window.fct_sslcommerz_data?.translations || {};
        return translations[string] || string;
    }

    init() {
        const sslcommerzContainer = document.querySelector('.fluent-cart-checkout_embed_payment_container_sslcommerz');
        if (!sslcommerzContainer) {
            console.error('SSLCommerz container not found');
            return;
        }

        // Clear any existing content
        sslcommerzContainer.innerHTML = '';

        const checkoutType = this.paymentArgs?.checkout_type || 'hosted';

        if (checkoutType === 'modal') {
            this.initModalCheckout(sslcommerzContainer);
        } else {
            this.initHostedCheckout(sslcommerzContainer);
        }
    }

    initModalCheckout(container) {
        // Hide payment methods selector if present
        const paymentMethods = this.form.querySelector('.fluent_cart_payment_methods');
        if (paymentMethods) {
            paymentMethods.style.display = 'none';
        }

        // Create and render the Pay Now button
        this.createPayNowButton(container);

        // Listen for next action event (after order is created)
        this.setupNextActionListener();

        // Remove loading indicator
        const loadingElement = document.getElementById('fct_loading_payment_processor');
        if (loadingElement) {
            loadingElement.remove();
        }
    }

    initHostedCheckout(container) {
        // Enable checkout button for hosted redirect flow
        this.paymentLoader.enableCheckoutButton(this.submitButton?.text || this.$t('Place Order'));

        // Show payment info
        const infoDiv = document.createElement('div');
        infoDiv.className = 'sslcommerz-hosted-checkout-info';
        infoDiv.style.cssText = 'padding: 15px; background: #f8f9fa; border-radius: 4px; margin: 10px 0;';
        const infoText = document.createElement('p');
        infoText.style.cssText = 'margin: 0; color: #495057; font-size: 14px; text-align: center;';
        infoText.textContent = this.$t('You will be redirected to SSLCommerz to complete your payment');
        infoDiv.appendChild(infoText);
        container.appendChild(infoDiv);

        // Listen for next action event
        this.setupNextActionListener();

        // Remove loading indicator
        const loadingElement = document.getElementById('fct_loading_payment_processor');
        if (loadingElement) {
            loadingElement.remove();
        }
    }

    createPayNowButton(container) {
        const payNowButton = document.createElement('button');
        payNowButton.id = 'sslcommerz-pay-button';
        payNowButton.className = 'sslcommerz-payment-button';
        payNowButton.type = 'button';
        payNowButton.textContent = this.data?.payment_args?.modal_checkout_button_text;
        payNowButton.style.cssText = `
            width: 100%;
            padding: 12px 24px;
            background: ${this.data?.payment_args?.modal_checkout_button_color};
            color: ${this.data?.payment_args?.modal_checkout_button_text_color};
            border: none;
            border-radius: 6px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            transition: background-color 0.2s;
            margin-bottom: 10px;
        `;

        // Add hover effect
        payNowButton.addEventListener('mouseenter', () => {
            payNowButton.style.backgroundColor = this.data?.payment_args?.modal_checkout_button_hover_color;
        });
        payNowButton.addEventListener('mouseleave', () => {
            payNowButton.style.backgroundColor = this.data?.payment_args?.modal_checkout_button_color
        });

        payNowButton.addEventListener('click', async (e) => {
            e.preventDefault();
            await this.handlePayNowButtonClick();
        });

        // Add button to container
        container.appendChild(payNowButton);

        const extraText = document.createElement('p');
        extraText.style.cssText = `
            text-align: center;
            margin-top: 10px;
            font-size: 14px;
            color: #666;
        `;
        extraText.textContent = this.$t('Secure payment powered by SSLCommerz');
        container.appendChild(extraText);
    }

    async handlePayNowButtonClick() {
        try {
            this.paymentLoader?.changeLoaderStatus('processing');
            
            if (typeof this.orderHandler === 'function') {
                const orderData = await this.orderHandler();
                
                if (!orderData) {
                    this.paymentLoader?.changeLoaderStatus(this.$t('Order creation failed'));
                    this.paymentLoader?.hideLoader();
                    this.paymentLoader?.enableCheckoutButton();
                    throw new Error(this.$t('Failed to create order'));
                }

                this.currentOrderData = orderData;
                
                // The next action event will be triggered automatically
                // We'll handle it in setupNextActionListener
                
            } else {
                this.paymentLoader?.changeLoaderStatus(this.$t('Order handler not available'));
                this.paymentLoader?.hideLoader();
                this.paymentLoader?.enableCheckoutButton();
                throw new Error(this.$t('Order handler is not properly configured'));
            }
            
        } catch (error) {
            this.paymentLoader?.changeLoaderStatus('Error: ' + error.message);
            this.paymentLoader?.hideLoader();
            this.paymentLoader?.enableCheckoutButton();
            
            // Show error to user
            this.displayErrorMessage(
                document.querySelector('.fluent-cart-checkout_embed_payment_container_sslcommerz'),
                error.message
            );
        }
    }

    setupNextActionListener() {
        const that = this;
        
        window.addEventListener('fluent_cart_payment_next_action_sslcommerz', async (e) => {
            try {
                const remoteResponse = e.detail?.response;
                const sslcommerzData = remoteResponse?.payment_args || {};
                const checkoutType = sslcommerzData?.checkout_type || 'hosted';

                if (checkoutType === 'modal') {
                    // Modal checkout: Load embed script and setup button
                    await that.handleModalCheckout(sslcommerzData, remoteResponse);
                } else {
                    // Hosted checkout: Redirect to checkout URL
                    that.handleHostedCheckout(sslcommerzData);
                }
                
            } catch (error) {
                console.error('SSLCommerz next action error:', error);
                that.handleError(error);
            }
        }, { once: false }); // Allow multiple triggers
    }

    handleModalCheckout(sslcommerzData) {
        const checkoutUrl = sslcommerzData.checkout_url;
        const transactionHash = sslcommerzData.transaction_hash;
        const orderHash = sslcommerzData.order_hash;
        const paymentMode = sslcommerzData.payment_mode || 'test';

        if (!checkoutUrl) {
            this.handleError(new Error(this.$t('SSLCommerz checkout URL not found')));
            return;
        }

        // Render the modal with SSL Commerz's own embed SDK. It owns the iframe, the framing
        // (it appends ?full=1 and names the frame "frame" internally), the postMessage navigation
        // for OTP / bank / completion, and the popup UI — so we don't reproduce any of that.
        this.loadEmbedScript(paymentMode)
            .then(() => {
                this.paymentLoader?.hideLoader();
                this.setupSslczButton(transactionHash, orderHash);
                // The SDK binds to #sslczPayBtn via event delegation; trigger it to open the modal.
                setTimeout(() => {
                    const btn = document.getElementById('sslczPayBtn');
                    if (btn) {
                        btn.click();
                    }
                }, 50);
            })
            .catch((error) => {
                this.handleError(error);
            });
    }

    // Load SSL Commerz's embed SDK once (shared across checkout instances).
    loadEmbedScript(mode) {
        return new Promise((resolve, reject) => {
            if (window.__sslcommerzEmbedLoaded) {
                resolve();
                return;
            }

            const existing = document.getElementById('sslcommerz-embed-sdk');
            if (existing) {
                existing.addEventListener('load', () => resolve());
                existing.addEventListener('error', () => reject(new Error(this.$t('Failed to load SSLCommerz script'))));
                return;
            }

            const embedUrl = (mode === 'live')
                ? 'https://seamless-epay.sslcommerz.com/embed.min.js'
                : 'https://sandbox.sslcommerz.com/embed.min.js';

            const script = document.createElement('script');
            script.id = 'sslcommerz-embed-sdk';
            script.src = embedUrl;
            script.async = true;
            script.onload = () => {
                window.__sslcommerzEmbedLoaded = true;
                resolve();
            };
            script.onerror = () => reject(new Error(this.$t('Failed to load SSLCommerz script')));
            document.head.appendChild(script);
        });
    }

    // Build the button the SSL Commerz SDK looks for (#sslczPayBtn). The SDK reads its `endpoint`
    // and `order` attributes, POSTs to the endpoint to fetch the GatewayPageURL, then opens its
    // own modal. Our endpoint (sslcommerz_init_modal) returns the already-created session URL.
    setupSslczButton(transactionHash, orderHash) {
        const container = document.querySelector('.fluent-cart-checkout_embed_payment_container_sslcommerz');
        if (!container) {
            return;
        }

        let endpoint = window.fluentcart_checkout_vars?.ajaxurl || window.ajaxurl || '/wp-admin/admin-ajax.php';
        endpoint += (endpoint.indexOf('?') > -1 ? '&' : '?') + 'action=sslcommerz_init_modal';
        if (transactionHash) {
            endpoint += '&transaction_hash=' + encodeURIComponent(transactionHash);
        }
        if (orderHash) {
            endpoint += '&order_hash=' + encodeURIComponent(orderHash);
        }

        container.innerHTML = '';

        const button = document.createElement('button');
        button.id = 'sslczPayBtn';          // REQUIRED: the SDK binds to this id.
        button.type = 'button';
        button.setAttribute('endpoint', endpoint);
        if (transactionHash) {
            button.setAttribute('order', transactionHash);   // REQUIRED non-empty by the SDK.
        }
        if (window.fluentCartRestVars?.rest?.nonce) {
            button.setAttribute('token', window.fluentCartRestVars.rest.nonce);
        }

        button.textContent = this.data?.payment_args?.modal_checkout_button_text || this.$t('Pay Now');
        button.style.cssText = 'width:100%;padding:12px 24px;background:' +
            (this.data?.payment_args?.modal_checkout_button_color || '#0B9E48') + ';color:' +
            (this.data?.payment_args?.modal_checkout_button_text_color || '#fff') +
            ';border:none;border-radius:6px;font-size:16px;font-weight:600;cursor:pointer;';

        container.appendChild(button);
    }

    handleHostedCheckout(sslcommerzData) {

        console.log('sslcommerz data', sslcommerzData);

        const checkoutUrl = sslcommerzData.checkout_url;
        
        if (!checkoutUrl) {
            this.handleError(new Error(this.$t('SSLCommerz checkout URL not found')));
            return;
        }

        // Redirect to hosted checkout
        this.paymentLoader?.changeLoaderStatus(this.$t('Redirecting to payment gateway...'));
        window.location.href = checkoutUrl;
    }

    handleError(error) {
        const errorMessage = error?.message || this.$t('An error occurred');
        
        this.paymentLoader?.changeLoaderStatus('Error: ' + errorMessage);
        this.paymentLoader?.hideLoader();
        this.paymentLoader?.enableCheckoutButton(this.submitButton?.text || this.$t('Place Order'));
        
        // Display error to user
        this.displayErrorMessage(
            document.querySelector('.fluent-cart-checkout_embed_payment_container_sslcommerz'),
            errorMessage
        );
    }

    displayErrorMessage(container, message) {
        if (!container) return;

        const errorDiv = document.createElement('div');
        errorDiv.style.cssText = `
            color: #dc3545;
            padding: 15px;
            border: 1px solid #dc3545;
            border-radius: 6px;
            background: #ffeaea;
            margin-top: 10px;
            font-size: 14px;
        `;
        errorDiv.className = 'fc-error-message';
        errorDiv.innerHTML = `<strong>${this.$t('Error')}:</strong> ${message}`;

        // Remove any existing error messages
        const existingError = container.querySelector('.fc-error-message');
        if (existingError) {
            existingError.remove();
        }

        container.appendChild(errorDiv);
    }
}

// Version marker — confirm the browser is running the latest (non-cached) script.
console.log('[SSLCommerz for FluentCart] checkout handler loaded — embed-sdk build 3');

// Listen for initial payment load event
window.addEventListener('fluent_cart_load_payments_sslcommerz', function (e) {
    const sslcommerzContainer = document.querySelector('.fluent-cart-checkout_embed_payment_container_sslcommerz');
    
    if (sslcommerzContainer) {
        sslcommerzContainer.innerHTML = '<div id="fct_loading_payment_processor">Loading SSLCommerz...</div>';
    }

    fetch(e.detail.paymentInfoUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-WP-Nonce': e.detail.nonce,
        },
        credentials: 'include'
    })
    .then(async (response) => {
        response = await response.json();
        
        if (response?.status === 'failed') {
            displayErrorMessage(response?.message || 'Failed to load payment information');
            return;
        }
        
        // Initialize the SSLCommerz checkout class
        new SslcommerzCheckout(
            e.detail.form,
            e.detail.orderHandler,
            response,
            e.detail.paymentLoader
        ).init();
    })
    .catch(error => {
        const translations = window.fct_sslcommerz_data?.translations || {};
        function $t(string) {
            return translations[string] || string;
        }
        const message = error?.message || $t('An error occurred while loading SSLCommerz');
        displayErrorMessage(message);
    });

    function displayErrorMessage(message) {
        const sslcommerzContainer = document.querySelector('.fluent-cart-checkout_embed_payment_container_sslcommerz');
        if (sslcommerzContainer) {
            sslcommerzContainer.innerHTML = `
                <div style="color: #dc3545; padding: 15px; border: 1px solid #dc3545; border-radius: 4px; background: #ffeaea;">
                    <strong>Error:</strong> ${message}
                </div>
            `;
        }

        const loadingElement = document.getElementById('fct_loading_payment_processor');
        if (loadingElement) {
            loadingElement.remove();
        }

        // Enable checkout button
        const paymentLoader = e.detail?.paymentLoader;
        const submitButton = window.fluentcart_checkout_vars?.submit_button;
        if (paymentLoader) {
            paymentLoader.enableCheckoutButton(submitButton?.text || 'Place Order');
        }
    }
});
