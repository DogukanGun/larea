package com.larea.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Redo
import androidx.compose.material.icons.filled.Block
import androidx.compose.material.icons.filled.CreditCard
import androidx.compose.material.icons.filled.GppMaybe
import androidx.compose.material.icons.filled.LockOpen
import androidx.compose.material.icons.filled.MoreHoriz
import androidx.compose.material.icons.filled.PersonOff
import androidx.compose.material.icons.filled.Repeat
import androidx.compose.material.icons.filled.ThumbDown
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.larea.app.ui.theme.Larea
import com.larea.app.ui.theme.LareaType
import com.larea.app.ui.theme.Spacing

data class ReportReason(val code: String, val title: String, val detail: String, val icon: ImageVector)

object ReportReasons {
    val chat = listOf(
        ReportReason("HARASSMENT", "Harassment", "Targeting or bullying someone", Icons.Filled.PersonOff),
        ReportReason("THREAT", "Threat", "Threatening or intimidating", Icons.Filled.GppMaybe),
        ReportReason("HATE", "Hate", "Attacks on a group of people", Icons.Filled.ThumbDown),
        ReportReason("SEXUAL", "Sexual content", "Explicit or unwanted advances", Icons.Filled.VisibilityOff),
        ReportReason("SPAM", "Spam", "Repeated or off-topic posts", Icons.Filled.Repeat),
        ReportReason("SCAM", "Scam", "Fraud or suspicious offers", Icons.Filled.CreditCard),
        ReportReason("PERSONAL_INFO", "Personal information", "Sharing someone's private details", Icons.Filled.LockOpen),
        ReportReason("OTHER", "Something else", "Anything else that feels wrong", Icons.Filled.MoreHoriz),
    )

    val listing = listOf(
        ReportReason("PROHIBITED_ITEM", "Not allowed here", "Weapons, drugs, animals, counterfeit or stolen goods", Icons.Filled.Block),
        ReportReason("SCAM", "Scam", "Looks fraudulent or misleading", Icons.Filled.CreditCard),
        ReportReason("OFF_PLATFORM_PAYMENT", "Asks to pay elsewhere", "Wants cash, bank transfer or another app", Icons.AutoMirrored.Filled.Redo),
        ReportReason("SEXUAL", "Sexual content", "Explicit photos or services", Icons.Filled.VisibilityOff),
        ReportReason("HARASSMENT", "Harassment", "Targets or bullies someone", Icons.Filled.PersonOff),
        ReportReason("PERSONAL_INFO", "Personal information", "Shares someone's private details", Icons.Filled.LockOpen),
        ReportReason("OTHER", "Something else", "Anything else that feels wrong", Icons.Filled.MoreHoriz),
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ReportSheet(title: String, reasons: List<ReportReason>, onDismiss: () -> Unit, onReport: (String) -> Unit) {
    val c = Larea.colors
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true), containerColor = c.grouped) {
        Column(Modifier.exposeTestTags().verticalScroll(rememberScrollState()).navigationBarsPadding().padding(bottom = Spacing.l)) {
            Text(title, style = LareaType.headline, color = c.text, textAlign = TextAlign.Center, modifier = Modifier.padding(bottom = Spacing.m).align(Alignment.CenterHorizontally))
            GroupedCard {
                reasons.forEachIndexed { index, reason ->
                    ListRow(onClick = { onReport(reason.code) }, tag = "report.${reason.code}") {
                        Box(Modifier.size(36.dp).background(c.brandTint, CircleShape), contentAlignment = Alignment.Center) {
                            Icon(reason.icon, contentDescription = null, tint = c.brandPrimary, modifier = Modifier.size(20.dp))
                        }
                        Column(verticalArrangement = Arrangement.spacedBy(2.dp), modifier = Modifier.weight(1f)) {
                            Text(reason.title, style = LareaType.headline, color = c.text)
                            Text(reason.detail, style = LareaType.subheadline, color = c.secondaryText)
                        }
                    }
                    if (index < reasons.lastIndex) RowDivider(inset = 64)
                }
            }
        }
    }
}

