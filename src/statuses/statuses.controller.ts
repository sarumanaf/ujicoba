import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { StatusesService } from './statuses.service';
import { CreateStatusDto } from './dto/create-status.dto';
import { UpdateStatusDto } from './dto/update-status.dto';
import { ReorderStatusDto } from './dto/reorder-status.dto';
import { ProjectAdminGuard } from '../projects/guards/project-admin.guard';
import { ProjectMemberGuard } from '../projects/guards/project-member.guard';
import { StatusAdminGuard } from './guards/status-admin.guard';

@ApiTags('Statuses')
@ApiBearerAuth()
@Controller()
export class StatusesController {
  constructor(private readonly statusesService: StatusesService) {}

  @Post('projects/:projectId/statuses')
  @UseGuards(ProjectAdminGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Buat status kustom baru untuk proyek (Admin Only)' })
  @ApiResponse({ status: 201, description: 'Status berhasil dibuat' })
  @ApiResponse({ status: 403, description: 'Bukan member / bukan admin proyek' })
  @ApiResponse({ status: 404, description: 'Proyek tidak ditemukan' })
  @ApiResponse({ status: 409, description: 'Konflik perubahan bersamaan; muat ulang dan coba lagi' })
  create(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Req() req: any,
    @Body() dto: CreateStatusDto,
  ) {
    const userId = req.user.id || req.user.sub;
    return this.statusesService.create(projectId, userId, dto);
  }

  @Get('projects/:projectId/statuses')
  @UseGuards(ProjectMemberGuard)
  @ApiOperation({ summary: 'Ambil daftar status proyek terurut berdasarkan order' })
  @ApiResponse({ status: 200, description: 'Berhasil mengambil daftar status' })
  @ApiResponse({ status: 403, description: 'Anda bukan anggota proyek ini' })
  @ApiResponse({ status: 404, description: 'Proyek tidak ditemukan' })
  findAllByProject(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Req() req: any,
  ) {
    const userId = req.user.id || req.user.sub;
    return this.statusesService.findAllByProject(projectId, userId);
  }

  
  @Patch('projects/:projectId/statuses/reorder')
  @UseGuards(ProjectAdminGuard)
  @ApiOperation({ summary: 'Ubah urutan tampilan banyak status sekaligus (Admin Only)' })
  @ApiResponse({ status: 200, description: 'Urutan status berhasil diperbarui' })
  @ApiResponse({ status: 400, description: 'Satu atau lebih status_id invalid' })
  @ApiResponse({ status: 403, description: 'Bukan member / bukan admin proyek' })
  @ApiResponse({ status: 404, description: 'Proyek tidak ditemukan' })
  @ApiResponse({ status: 409, description: 'Konflik perubahan bersamaan; muat ulang dan coba lagi' })
  reorder(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Req() req: any,
    @Body() dto: ReorderStatusDto,
  ) {
    const userId = req.user.id || req.user.sub;
    return this.statusesService.reorder(projectId, userId, dto);
  }

  @Patch('statuses/:id')
  @UseGuards(StatusAdminGuard)
  @ApiOperation({ summary: 'Perbarui data status (Admin Only)' })
  @ApiResponse({ status: 200, description: 'Status berhasil diperbarui' })
  @ApiResponse({ status: 400, description: 'Validasi default status gagal' })
  @ApiResponse({ status: 403, description: 'Bukan member / bukan admin proyek' })
  @ApiResponse({ status: 404, description: 'Status tidak ditemukan' })
  @ApiResponse({ status: 409, description: 'Konflik perubahan bersamaan; muat ulang dan coba lagi' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: any,
    @Body() dto: UpdateStatusDto,
  ) {
    const userId = req.user.id || req.user.sub;
    return this.statusesService.update(id, userId, dto);
  }

  @Delete('statuses/:id')
  @UseGuards(StatusAdminGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Hapus status dengan proteksi (Admin Only)' })
  @ApiResponse({ status: 204, description: 'Status berhasil dihapus' })
  
  @ApiResponse({ status: 400, description: 'Status terakhir dalam project',})
  @ApiResponse({ status: 403, description: 'Bukan member / bukan admin proyek' })
  @ApiResponse({ status: 404, description: 'Status tidak ditemukan' })
  @ApiResponse({ status: 409, description: 'Status masih digunakan oleh task atau konflik perubahan bersamaan'})
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: any,
  ) {
    const userId = req.user.id || req.user.sub;
    return this.statusesService.remove(id, userId);
  }
}