-- Sync invoice status with verified payments
-- Creates a trigger that keeps invoices.status aligned with payments.verified

CREATE OR REPLACE FUNCTION public.sync_invoice_status()
RETURNS TRIGGER AS $$
DECLARE
    invoice_amount numeric;
    verified_total numeric;
    covered integer;
BEGIN
    -- Load invoice details
    SELECT amount, months_covered
      INTO invoice_amount, covered
      FROM invoices
     WHERE id = NEW.invoice_id;

    -- Sum verified payments for this invoice
    SELECT COALESCE(SUM(amount_paid), 0)
      INTO verified_total
      FROM payments
     WHERE invoice_id = NEW.invoice_id
       AND verified = TRUE;

    -- If fully covered (or multi-month invoice), mark paid; otherwise unpaid
    IF verified_total >= invoice_amount OR covered > 1 THEN
        UPDATE invoices
           SET status = TRUE,
               payment_date = NOW(),
               updated_at = NOW()
         WHERE id = NEW.invoice_id;
    ELSE
        UPDATE invoices
           SET status = FALSE,
               updated_at = NOW()
         WHERE id = NEW.invoice_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to run after payment verification/amount changes
DROP TRIGGER IF EXISTS trg_sync_invoice_status ON payments;

CREATE TRIGGER trg_sync_invoice_status
AFTER INSERT OR UPDATE OF verified, amount_paid
ON public.payments
FOR EACH ROW
EXECUTE FUNCTION public.sync_invoice_status();
