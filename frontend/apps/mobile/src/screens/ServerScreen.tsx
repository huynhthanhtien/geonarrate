import { useState } from "react";
import { useI18n } from "../i18n";
import { BackendAddressError, getBackend, parseBackend, setBackend, checkBackend } from "../api";
import { colors, space } from "../theme";
import { Button, Card, Header, Screen, TextField, Txt } from "../ui";
import { setPref } from "../store";

export function ServerScreen({ onBack, onSave }: { onBack: () => void; onSave: () => void }) {
  const { t } = useI18n();
  const [address, setAddress] = useState(getBackend);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connect = async () => {
    setError(null);
    let server: string;
    try {
      server = parseBackend(address);
    } catch (reason) {
      setError(t(reason instanceof BackendAddressError && reason.reason === "cleartext" ? "server.cleartext" : "server.invalid"));
      return;
    }
    setBusy(true);
    try {
      await checkBackend(server);
      setPref("backend_url", server);
      setBackend(server);
      onSave();
    } catch {
      setError(t("server.unreachable"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Header title={t("server.title")} onBack={busy ? undefined : onBack} backLabel={t("common.back")} />
      <Txt variant="body" color={colors.textMuted}>{t("server.description")}</Txt>
      <Card style={{ gap: space.md }}>
        <TextField
          label={t("server.address")}
          value={address}
          onChangeText={setAddress}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          editable={!busy}
          placeholder={t("server.placeholder")}
          accessibilityLabel={t("server.address")}
        />
        {error ? (
          <Txt variant="small" color={colors.danger} accessibilityRole="alert">{error}</Txt>
        ) : null}
        <Button
          label={busy ? t("server.connecting") : t("server.connect")}
          onPress={() => void connect()}
          disabled={busy}
          loading={busy}
          icon="link-outline"
        />
      </Card>
    </Screen>
  );
}
